import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { auditCreateFields, auditDeleteFields, auditUpdateFields } from '../common/utils/audit';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { UNIT_NOT_AVAILABLE, UNIT_PRECISION_EXCEEDED } from '../common/errors/unit-error-codes';
import { decimalPlacesOf } from '../common/utils/decimal-scale';
import { parseIdentifier, type IdentifierType } from '../common/utils/product-identifier';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';
import type {
  IdentifierInput,
  MeasurementInput,
  PresentationInput,
  ReplaceProductSpecificationInput
} from '../validators/product-specification.validators';

/**
 * What the catalog knows about one unit, as far as this aggregate cares.
 *
 * `available` is `status: active` **and** not soft-deleted: the condition for a
 * *new* assignment. A unit that fails it can still be retained by whatever
 * already stores its code, which is what keeps a historical record editable.
 */
interface UnitInfo {
  dimension: string;
  decimals: number;
  available: boolean;
}

/**
 * The product-specification aggregate.
 *
 * `Product` stays the root; this service owns everything hanging off it: one
 * optional specification, N presentations with N identifiers each, and the N:M
 * supplier set. The whole aggregate is read and replaced as a unit, so a partial
 * save is not representable by the contract.
 *
 * ## Why a dedicated service instead of the generic CRUD stack
 *
 * The generic stack maps one model to one endpoint. This write needs, in a
 * single transaction: tenant-scoped ownership checks, unit-dimension validation
 * against a global catalog, GTIN normalization plus tenant-wide uniqueness,
 * coordinated soft deletion and revival of children, and actor audit fields on
 * every row. That is domain orchestration, not persistence.
 *
 * ## Error codes
 *
 * The five specific codes of the API contract are thrown here (see
 * `product-specification.validators.ts` for why they cannot live in Zod). Each
 * one carries the nested `details[].field` path of the offending value, which is
 * the same path shape the validator produces, so the frontend binds both the
 * same way.
 */
@injectable()
export class ProductSpecificationService {
  constructor(
    @inject(TOKENS.Prisma) private readonly prisma: any,
    @inject(TOKENS.ProductRepository) private readonly productRepository: TenantCrudRepository<any>
  ) {}

  /** Reads the aggregate. Returns an empty aggregate when nothing was captured. */
  async getAggregate(tenantId: string | null, productId: string): Promise<any> {
    const resolvedTenantId = this.requireTenant(tenantId);
    const product = await this.resolveProduct(resolvedTenantId, productId);

    return this.readAggregate(this.prisma, resolvedTenantId, product);
  }

  /**
   * Full replacement. Idempotent: sending the same body twice produces the same
   * rows, because children are matched by their supplied id and supplier links
   * revive rather than duplicate.
   */
  async replaceAggregate(
    tenantId: string | null,
    productId: string,
    input: ReplaceProductSpecificationInput,
    actor: ActorContext
  ): Promise<any> {
    const resolvedTenantId = this.requireTenant(tenantId);

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const product = await this.resolveProduct(resolvedTenantId, productId);
        const current = await this.loadCurrentState(tx, resolvedTenantId, productId);

        // --- validate everything before writing anything -------------------
        const brandId = await this.resolveBrand(tx, resolvedTenantId, input.brandId, current.specification);
        await this.assertSuppliersAssignable(tx, resolvedTenantId, productId, input.supplierIds);

        const units = await this.loadUnits(tx);
        this.assertMeasurementUnits(input.measurements, units, current.specification);

        const presentations = this.preparePresentations(input.presentations, units, current);

        this.assertUniquePresentationNames(presentations);
        await this.assertUniqueIdentifiers(tx, resolvedTenantId, presentations);

        // --- write ---------------------------------------------------------
        await this.writeSpecification(tx, resolvedTenantId, productId, brandId, input, actor);
        await this.writePresentations(tx, resolvedTenantId, productId, presentations, current, actor);
        await this.writeSuppliers(tx, resolvedTenantId, productId, input.supplierIds, actor);

        return this.readAggregate(tx, resolvedTenantId, product);
      });
    } catch (error) {
      throw this.mapUniqueViolation(error, input);
    }
  }

  /**
   * Soft-deletes the aggregate and every child. The Product and the catalogs are
   * never touched: this clears captured specifications, it does not delete the
   * product.
   */
  async removeAggregate(tenantId: string | null, productId: string, actor: ActorContext): Promise<any> {
    const resolvedTenantId = this.requireTenant(tenantId);
    const now = new Date();

    await this.prisma.$transaction(async (tx: any) => {
      await this.resolveProduct(resolvedTenantId, productId);

      const presentations = await tx.productPresentation.findMany({
        where: { tenantId: resolvedTenantId, productId, deletedAt: null }
      });

      for (const presentation of presentations) {
        await tx.productIdentifier.updateMany({
          where: { tenantId: resolvedTenantId, presentationId: presentation.id, deletedAt: null },
          data: { ...auditDeleteFields(actor), status: 'inactive' }
        });
      }

      await tx.productPresentation.updateMany({
        where: { tenantId: resolvedTenantId, productId, deletedAt: null },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });

      await tx.productSupplier.updateMany({
        where: { tenantId: resolvedTenantId, productId, deletedAt: null },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });

      await tx.productSpecification.updateMany({
        where: { tenantId: resolvedTenantId, productId, deletedAt: null },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });
    });

    // Re-read rather than assume: the response must describe what is stored.
    return this.getAggregate(resolvedTenantId, productId);
  }

  // --- reads ---------------------------------------------------------------

  private async readAggregate(tx: any, tenantId: string, product: any): Promise<any> {
    const specification = await tx.productSpecification.findFirst({
      where: { tenantId, productId: product.id, deletedAt: null },
      include: { brand: true }
    });

    const presentations: any[] = await tx.productPresentation.findMany({
      where: { tenantId, productId: product.id, deletedAt: null }
    });

    const identifiers: any[] = await tx.productIdentifier.findMany({
      where: { tenantId, productId: product.id, deletedAt: null }
    });

    const links: any[] = await tx.productSupplier.findMany({
      where: { tenantId, productId: product.id, deletedAt: null },
      include: { supplier: true }
    });

    return {
      product: { id: product.id, sku: product.sku, name: product.name },
      specification: specification
        ? {
            id: specification.id,
            brandId: specification.brandId ?? null,
            // The brand is included even when it is soft-deleted: deleting a
            // brand must not detach a historical specification.
            brandName: specification.brand?.name ?? null,
            model: specification.model ?? null,
            measurements: {
              weight: measurementOf(specification.weight, specification.weightUnitCode),
              length: measurementOf(specification.length, specification.lengthUnitCode),
              depth: measurementOf(specification.depth, specification.depthUnitCode)
            }
          }
        : null,
      // Deterministic ordering: the contract promises a stable aggregate, so
      // tests and the UI never depend on the storage engine's row order.
      presentations: presentations
        .map((presentation) => ({
          id: presentation.id,
          name: presentation.name,
          quantity: presentation.quantity,
          unitCode: presentation.unitCode,
          identifiers: identifiers
            .filter((identifier) => identifier.presentationId === presentation.id)
            .map((identifier) => ({
              id: identifier.id,
              type: identifier.type,
              value: identifier.value,
              normalizedValue: identifier.normalizedValue
            }))
            .sort(byField('value'))
        }))
        .sort(byField('name')),
      suppliers: links
        .map((link) => ({ id: link.supplierId, name: link.supplier?.name ?? null }))
        .sort(byField('name'))
    };
  }

  private async loadCurrentState(tx: any, tenantId: string, productId: string): Promise<any> {
    return {
      specification: await tx.productSpecification.findFirst({
        where: { tenantId, productId, deletedAt: null }
      }),
      presentations: await tx.productPresentation.findMany({
        where: { tenantId, productId } // includes soft-deleted, so ids can be revived
      }),
      identifiers: await tx.productIdentifier.findMany({ where: { tenantId, productId } }),
      suppliers: await tx.productSupplier.findMany({ where: { tenantId, productId } })
    };
  }

  private async resolveProduct(tenantId: string, productId: string): Promise<any> {
    // Tenant-scoped lookup, so another tenant's product is a 404 and never a 403.
    const product = await this.productRepository.findById(tenantId, productId);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  // --- validation ----------------------------------------------------------

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) {
      throw new ValidationError('Tenant context is required to manage product specifications');
    }
    return tenantId;
  }

  /**
   * Every unit, inactive and soft-deleted rows included.
   *
   * The catalog is small, and the distinction is what the retention rule needs:
   * a unit that is no longer available must still be *recognizable* here so the
   * measurement or presentation that already stores its code can keep it.
   */
  private async loadUnits(tx: any): Promise<Map<string, UnitInfo>> {
    const units: any[] = await tx.unitOfMeasure.findMany({});

    return new Map(
      units.map((unit) => [
        unit.code,
        {
          dimension: unit.dimension,
          decimals: Number(unit.decimals ?? 0),
          available: unit.status === 'active' && unit.deletedAt === null
        }
      ])
    );
  }

  /**
   * A brand must exist in the tenant and be active — with one exception: the
   * brand already on this specification may be re-submitted even after it was
   * soft-deleted, so editing an old record does not silently drop its brand.
   */
  private async resolveBrand(
    tx: any,
    tenantId: string,
    brandId: string | null,
    currentSpecification: any
  ): Promise<string | null> {
    if (!brandId) return null;

    if (currentSpecification?.brandId === brandId) return brandId;

    const brand = await tx.brand.findFirst({ where: { id: brandId, tenantId, deletedAt: null } });
    if (!brand) {
      throw new ValidationError('Unknown brand', [
        { field: 'brandId', message: 'brand not found for this company' }
      ]);
    }

    return brandId;
  }

  /**
   * A supplier may be assigned when it is **active and not deleted**, or when
   * this product already holds a live link to it.
   *
   * The supplier catalog is global, so it is not filtered by tenant; the *link*
   * is, because it hangs off a company-owned product. Two details are easy to get
   * wrong and are the reason this is not a simple existence check:
   *
   * - The link must not be soft-deleted. A removed link is not "an existing
   *   assignment": letting it authorize a deactivated supplier would resurrect an
   *   assignment the user had explicitly dropped.
   * - Re-submitting a *live* link to a supplier that was deactivated afterwards
   *   must keep working, so editing an old record never silently detaches it.
   */
  private async assertSuppliersAssignable(
    tx: any,
    tenantId: string,
    productId: string,
    supplierIds: string[]
  ): Promise<void> {
    if (supplierIds.length === 0) return;

    const active: any[] = await tx.supplier.findMany({
      where: { deletedAt: null, status: 'active' }
    });
    const activeIds = new Set(active.map((supplier) => supplier.id));

    const links: any[] = await tx.productSupplier.findMany({
      where: { tenantId, productId, deletedAt: null }
    });
    const linkedIds = new Set(links.map((link) => link.supplierId));

    const rejected = supplierIds.filter((id) => !activeIds.has(id) && !linkedIds.has(id));

    if (rejected.length > 0) {
      throw new ValidationError('Unknown supplier', [
        { field: 'supplierIds', message: `not available: ${rejected.join(', ')}` }
      ]);
    }
  }

  /**
   * Validates the unit of one measurement.
   *
   * `retainedCode` is the code currently stored in **this same field**: a
   * measurement may keep the unit it already had even after the administrator
   * deactivated or deleted it, because dropping it would silently change the
   * meaning of the stored value. Retention is per field on purpose — the fact
   * that another measurement, or another presentation, uses a code never
   * authorizes a new assignment of an unavailable unit.
   *
   * Dimension is checked for both a new and a retained unit: a `count` unit can
   * never express a weight, however it got there.
   */
  private assertUnitUsable(
    unitCode: string,
    options: {
      expected: string;
      path: string;
      retainedCode: string | null;
      units: Map<string, UnitInfo>;
    }
  ): UnitInfo {
    const unit = options.units.get(unitCode);

    if (!unit) {
      throw new ValidationError('Unit of measure is not available', [
        {
          field: options.path,
          code: UNIT_NOT_AVAILABLE,
          params: { unitCode },
          message: `unknown unit code: ${unitCode}`
        }
      ], UNIT_NOT_AVAILABLE);
    }

    if (!unit.available && unitCode !== options.retainedCode) {
      throw new ValidationError('Unit of measure is not available', [
        {
          field: options.path,
          code: UNIT_NOT_AVAILABLE,
          params: { unitCode },
          message: `${unitCode} is no longer available for a new assignment`
        }
      ], UNIT_NOT_AVAILABLE);
    }

    if (unit.dimension !== options.expected) {
      throw new ValidationError('Unit of measure is not valid for this measurement', [
        {
          field: options.path,
          code: 'UNIT_DIMENSION_MISMATCH',
          params: { expected: options.expected, actual: unit.dimension },
          message: `requires a ${options.expected} unit, got ${unit.dimension}`
        }
      ], 'UNIT_DIMENSION_MISMATCH');
    }

    return unit;
  }

  /**
   * Enforces the selected unit's decimal scale on the captured value.
   *
   * This runs *after* the generic `DECIMAL(12,3)` shape check, which knows the
   * column but not the unit: `EA` allows no decimals at all, while `KG` allows
   * three. The comparison is decimal-safe (see `decimalPlacesOf`) and the report
   * carries the exact nested field path of the offending value.
   */
  private assertUnitPrecision(unit: UnitInfo, unitCode: string, value: unknown, path: string): void {
    const scale = decimalPlacesOf(value);
    if (scale <= unit.decimals) return;

    throw new ValidationError(
      `Unit '${unitCode}' accepts at most ${unit.decimals} decimal place(s)`,
      [
        {
          field: path,
          code: UNIT_PRECISION_EXCEEDED,
          params: { unitCode, decimals: unit.decimals, value: String(value) },
          message: `supports at most ${unit.decimals} decimal places`
        }
      ],
      UNIT_PRECISION_EXCEEDED
    );
  }

  /** Weight accepts `mass`; length and depth accept `length`. */
  private assertMeasurementUnits(
    measurements: ReplaceProductSpecificationInput['measurements'],
    units: Map<string, UnitInfo>,
    currentSpecification: any
  ): void {
    const fields = [
      { key: 'weight', expected: 'mass', retainedCode: currentSpecification?.weightUnitCode ?? null },
      { key: 'length', expected: 'length', retainedCode: currentSpecification?.lengthUnitCode ?? null },
      { key: 'depth', expected: 'length', retainedCode: currentSpecification?.depthUnitCode ?? null }
    ] as const;

    for (const field of fields) {
      const measurement = measurements[field.key];
      if (!measurement) continue;

      const path = `measurements.${field.key}`;
      const unit = this.assertUnitUsable(measurement.unitCode, {
        expected: field.expected,
        path: `${path}.unitCode`,
        retainedCode: field.retainedCode,
        units
      });

      this.assertUnitPrecision(unit, measurement.unitCode, measurement.value, `${path}.value`);
    }
  }

  /**
   * Turns the payload's presentations into a plan: which row each entry targets,
   * and the normalized GTIN for every identifier.
   *
   * A supplied child id must belong to this product; an identifier id must
   * additionally belong to the presentation it is nested under. Anything else is
   * `INVALID_CHILD_REFERENCE`, which is what stops a client from re-parenting
   * another product's or another presentation's row by guessing its UUID.
   */
  private preparePresentations(
    input: PresentationInput[],
    units: Map<string, UnitInfo>,
    current: any
  ): any[] {
    const knownPresentations: Map<string, any> = new Map(
      current.presentations.map((row: any) => [row.id, row])
    );
    const knownIdentifiers: Map<string, any> = new Map(
      current.identifiers.map((row: any) => [row.id, row])
    );

    return input.map((presentation, presentationIndex) => {
      const path = `presentations.${presentationIndex}`;

      // A presentation may keep the unit it already had — even one that was
      // deactivated or deleted since — but only *its own* current code. Sibling
      // presentations, and new rows, need an available unit.
      const currentPresentation = presentation.id ? knownPresentations.get(presentation.id) : undefined;

      const unit = this.assertUnitUsable(presentation.unitCode, {
        expected: 'count',
        path: `${path}.unitCode`,
        retainedCode: currentPresentation?.unitCode ?? null,
        units
      });

      this.assertUnitPrecision(unit, presentation.unitCode, presentation.quantity, `${path}.quantity`);

      if (presentation.id && !knownPresentations.has(presentation.id)) {
        throw new ValidationError('Presentation does not belong to this product', [
          {
            field: `${path}.id`,
            code: 'INVALID_CHILD_REFERENCE',
            message: 'presentation not found for this product'
          }
        ], 'INVALID_CHILD_REFERENCE');
      }

      const identifiers = presentation.identifiers.map((identifier, identifierIndex) =>
        this.prepareIdentifier(
          identifier,
          `${path}.identifiers.${identifierIndex}`,
          knownIdentifiers,
          presentation.id
        )
      );

      return {
        id: presentation.id,
        name: presentation.name,
        quantity: presentation.quantity,
        unitCode: presentation.unitCode,
        identifiers
      };
    });
  }

  private prepareIdentifier(
    identifier: IdentifierInput,
    path: string,
    knownIdentifiers: Map<string, any>,
    presentationId: string | undefined
  ): any {
    if (identifier.id) {
      const existing = knownIdentifiers.get(identifier.id);

      if (!existing || !presentationId || existing.presentationId !== presentationId) {
        throw new ValidationError('Identifier does not belong to this presentation', [
          {
            field: `${path}.id`,
            code: 'INVALID_CHILD_REFERENCE',
            message: 'identifier not found for this presentation'
          }
        ], 'INVALID_CHILD_REFERENCE');
      }
    }

    const parsed = parseIdentifier(identifier.type as IdentifierType, identifier.value);

    // `=== false` rather than `!parsed.ok`: the Jest tsconfig runs with
    // `strict: false`, where this union narrows only on a literal comparison.
    if (parsed.ok === false) {
      const checksum = parsed.reason === 'checksum';

      throw new ValidationError(
        checksum ? 'Barcode check digit is invalid' : 'Barcode is not valid for its type',
        [
          {
            field: `${path}.value`,
            code: checksum ? 'INVALID_IDENTIFIER_CHECKSUM' : 'INVALID_IDENTIFIER_FORMAT',
            message: checksum
              ? `check digit does not match for ${identifier.type}`
              : `${identifier.type} expects a different number of digits`
          }
        ],
        checksum ? 'INVALID_IDENTIFIER_CHECKSUM' : 'VALIDATION_ERROR'
      );
    }

    return {
      id: identifier.id,
      type: identifier.type,
      value: parsed.parsed.value,
      normalizedValue: parsed.parsed.normalizedValue
    };
  }

  /**
   * Active presentation names must be unique per product.
   *
   * The database has no unique constraint on the name on purpose — a permanent
   * one would block recreating a soft-deleted presentation — so the rule lives
   * here.
   *
   * Under full-replacement semantics this check only ever has to look at the
   * **payload**. Every stored presentation is either updated in place (its id is
   * in the payload) or soft-deleted because it was omitted, so a name already
   * stored on this product can never survive beside a payload entry that reuses
   * it: reusing a stored name *without* its id deliberately replaces that row.
   * Checking the stored rows as well would reject a legitimate replacement.
   *
   * Comparison is case-insensitive because the tables use the
   * `utf8mb4_unicode_ci` collation, where `Box` and `box` are the same value to
   * any index or comparison the database would perform.
   */
  private assertUniquePresentationNames(presentations: any[]): void {
    const seen = new Map<string, number>();

    presentations.forEach((presentation, index) => {
      const key = normalizeName(presentation.name);
      const firstIndex = seen.get(key);

      if (firstIndex !== undefined) {
        throw new ValidationError(
          'Active presentation name is duplicated',
          [
            {
              field: `presentations.${index}.name`,
              code: 'DUPLICATE_PRESENTATION',
              params: { firstIndex },
              message: `duplicates presentations.${firstIndex}.name`
            }
          ],
          'DUPLICATE_PRESENTATION'
        );
      }

      seen.set(key, index);
    });
  }

  /**
   * A GTIN-14 is unique **per tenant**, not per product, and soft deletion never
   * releases a barcode. So an identifier row that points at another product — or
   * at a presentation that was just soft-deleted — still owns its number.
   *
   * The check therefore queries every identifier in the tenant for the payload's
   * normalized values and only tolerates the rows it is about to update. Looking
   * at this product's identifiers alone would miss the common case of reusing
   * another product's barcode, which the database would then reject as an opaque
   * unique-constraint error.
   *
   * Deleted rows are deliberately included: "soft deletion does not release a
   * barcode" is only true if the lookup ignores `deletedAt`.
   */
  private async assertUniqueIdentifiers(
    tx: any,
    tenantId: string,
    presentations: any[]
  ): Promise<void> {
    const pathByNormalizedValue = new Map<string, string>();

    presentations.forEach((presentation, presentationIndex) => {
      presentation.identifiers.forEach((identifier: any, identifierIndex: number) => {
        const path = `presentations.${presentationIndex}.identifiers.${identifierIndex}.value`;
        const existingPath = pathByNormalizedValue.get(identifier.normalizedValue);

        if (existingPath) {
          throw identifierConflict(path, `already used by ${existingPath} in this request`);
        }

        pathByNormalizedValue.set(identifier.normalizedValue, path);
      });
    });

    if (pathByNormalizedValue.size === 0) return;

    const keptIds = new Set(
      presentations.flatMap((presentation) =>
        presentation.identifiers.map((identifier: any) => identifier.id).filter(Boolean)
      )
    );

    const stored: any[] = await tx.productIdentifier.findMany({
      where: { tenantId, normalizedValue: { in: [...pathByNormalizedValue.keys()] } }
    });

    for (const row of stored) {
      if (keptIds.has(row.id)) continue;

      const path = pathByNormalizedValue.get(row.normalizedValue) ?? 'presentations';

      throw identifierConflict(path, 'already used in this company');
    }
  }

  // --- writes --------------------------------------------------------------

  private async writeSpecification(
    tx: any,
    tenantId: string,
    productId: string,
    brandId: string | null,
    input: ReplaceProductSpecificationInput,
    actor: ActorContext
  ): Promise<void> {
    const measurements = {
      weight: input.measurements.weight?.value ?? null,
      weightUnitCode: input.measurements.weight?.unitCode ?? null,
      length: input.measurements.length?.value ?? null,
      lengthUnitCode: input.measurements.length?.unitCode ?? null,
      depth: input.measurements.depth?.value ?? null,
      depthUnitCode: input.measurements.depth?.unitCode ?? null
    };

    const payload = {
      brandId,
      model: input.model ?? null,
      ...measurements,
      status: 'active',
      deletedAt: null
    };

    await tx.productSpecification.upsert({
      where: { tenantId_productId: { tenantId, productId } },
      update: { ...payload, ...auditUpdateFields(actor) },
      create: { tenantId, productId, ...payload, ...auditCreateFields(actor) }
    });
  }

  private async writePresentations(
    tx: any,
    tenantId: string,
    productId: string,
    presentations: any[],
    current: any,
    actor: ActorContext
  ): Promise<void> {
    const keptPresentationIds = new Set<string>();

    for (const presentation of presentations) {
      const data = {
        name: presentation.name,
        quantity: presentation.quantity,
        unitCode: presentation.unitCode,
        status: 'active',
        deletedAt: null
      };

      let presentationId = presentation.id;

      if (presentationId) {
        // Reviving a soft-deleted row is the same write as updating an active
        // one: `deletedAt: null` is part of the payload.
        await tx.productPresentation.update({
          where: { id: presentationId },
          data: { ...data, ...auditUpdateFields(actor) }
        });
      } else {
        const created = await tx.productPresentation.create({
          data: { tenantId, productId, ...data, ...auditCreateFields(actor) }
        });
        presentationId = created.id;
      }

      keptPresentationIds.add(presentationId as string);

      await this.writeIdentifiers(
        tx,
        tenantId,
        productId,
        presentationId as string,
        presentation.identifiers,
        actor
      );
    }

    // Active presentations omitted from the payload are soft-deleted, together
    // with their identifiers: keeping an active identifier under a deleted
    // presentation would leave the aggregate inconsistent.
    for (const existing of current.presentations) {
      if (existing.deletedAt !== null || keptPresentationIds.has(existing.id)) continue;

      await tx.productIdentifier.updateMany({
        where: { tenantId, presentationId: existing.id, deletedAt: null },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });

      await tx.productPresentation.update({
        where: { id: existing.id },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });
    }
  }

  private async writeIdentifiers(
    tx: any,
    tenantId: string,
    productId: string,
    presentationId: string,
    identifiers: any[],
    actor: ActorContext
  ): Promise<void> {
    const keptIds = new Set<string>();

    for (const identifier of identifiers) {
      const data = {
        type: identifier.type,
        value: identifier.value,
        normalizedValue: identifier.normalizedValue,
        presentationId,
        status: 'active',
        deletedAt: null
      };

      if (identifier.id) {
        await tx.productIdentifier.update({
          where: { id: identifier.id },
          data: { ...data, ...auditUpdateFields(actor) }
        });
        keptIds.add(identifier.id);
      } else {
        const created = await tx.productIdentifier.create({
          data: { tenantId, productId, ...data, ...auditCreateFields(actor) }
        });
        keptIds.add(created.id);
      }
    }

    for (const existing of await tx.productIdentifier.findMany({
      where: { tenantId, presentationId, deletedAt: null }
    })) {
      if (keptIds.has(existing.id)) continue;

      await tx.productIdentifier.update({
        where: { id: existing.id },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });
    }
  }

  private async writeSuppliers(
    tx: any,
    tenantId: string,
    productId: string,
    supplierIds: string[],
    actor: ActorContext
  ): Promise<void> {
    for (const supplierId of supplierIds) {
      // The natural triple is the primary key, so a re-assigned supplier revives
      // the existing link instead of inserting a duplicate.
      await tx.productSupplier.upsert({
        where: { tenantId_productId_supplierId: { tenantId, productId, supplierId } },
        update: { ...auditUpdateFields(actor), status: 'active', deletedAt: null },
        create: { tenantId, productId, supplierId, status: 'active', ...auditCreateFields(actor) }
      });
    }

    // An empty array clears every link, which is the documented way to say "no
    // suppliers" for a full replacement.
    const kept = new Set(supplierIds);

    for (const link of await tx.productSupplier.findMany({
      where: { tenantId, productId, deletedAt: null }
    })) {
      if (kept.has(link.supplierId)) continue;

      await tx.productSupplier.update({
        where: { tenantId_productId_supplierId: { tenantId, productId, supplierId: link.supplierId } },
        data: { ...auditDeleteFields(actor), status: 'inactive' }
      });
    }
  }

  /**
   * Race safety net. The checks above make a conflict unlikely, but two
   * concurrent requests can still interleave, and the database is the only
   * authority on the unique index. Prisma's P2002 is translated into the
   * contract's 409 instead of leaking a driver error as a 500.
   */
  private mapUniqueViolation(error: unknown, input: ReplaceProductSpecificationInput): unknown {
    if ((error as any)?.code !== 'P2002') return error;

    const target = (error as any)?.meta?.target;
    const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '');

    if (!targetText.includes('normalized')) return error;

    // Locate the offending identifier in the payload so the 409 is still
    // actionable rather than a screen-level banner.
    const seen = new Map<string, string>();

    for (const [presentationIndex, presentation] of input.presentations.entries()) {
      for (const [identifierIndex, identifier] of presentation.identifiers.entries()) {
        const parsed = parseIdentifier(identifier.type as IdentifierType, identifier.value);
        const normalized = parsed.ok === true ? parsed.parsed.normalizedValue : identifier.value;
        const path = `presentations.${presentationIndex}.identifiers.${identifierIndex}.value`;

        if (seen.has(normalized)) return identifierConflict(path, 'already used in this company');

        seen.set(normalized, path);
      }
    }

    return new ConflictError('Barcode already used in this company', 'IDENTIFIER_ALREADY_EXISTS');
  }
}

// --- helpers ---------------------------------------------------------------

function measurementOf(value: unknown, unitCode: unknown): any {
  if (value === null || value === undefined) return null;
  return { value, unitCode: unitCode ?? null };
}

/** Case-insensitive key that matches the `utf8mb4_unicode_ci` collation. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 409, not 422: the API contract classifies a barcode already used in the tenant
 * as a conflict (see §8 of the implementation plan), so the pre-checked path and
 * the raced `P2002` path must agree on the status code.
 */
function identifierConflict(path: string, message: string): ConflictError {
  return new ConflictError('Identifier already exists', 'IDENTIFIER_ALREADY_EXISTS', [
    { field: path, code: 'IDENTIFIER_ALREADY_EXISTS', message }
  ]);
}

/** Total order by a string field, with the id as a deterministic tiebreaker. */
function byField(field: string): (left: any, right: any) => number {
  return (left, right) => {
    const a = String(left[field] ?? '');
    const b = String(right[field] ?? '');

    if (a !== b) return a < b ? -1 : 1;

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  };
}
