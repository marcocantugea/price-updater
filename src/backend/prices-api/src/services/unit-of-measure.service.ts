import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ConflictError, ValidationError } from '../common/errors';
import {
  UNIT_CODE_IMMUTABLE,
  UNIT_CODE_TAKEN,
  UNIT_DIMENSION_LOCKED,
  UNIT_PRECISION_EXCEEDED
} from '../common/errors/unit-error-codes';
import { auditUpdateFields } from '../common/utils/audit';
import { decimalPlacesOf } from '../common/utils/decimal-scale';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

/** Cap on the offending references reported back for one rejected edit. */
const MAX_REPORTED_REFERENCES = 20;

/**
 * The global unit-of-measure catalog.
 *
 * The catalog is shared by every company and business tables reference the
 * **code** by foreign key, so it is not an ordinary CRUD resource:
 *
 * - `code` is immutable once the row exists. Renaming it would either break the
 *   foreign keys or silently rewrite the unit of historical measurements, and no
 *   conversion is ever performed.
 * - `dimension` may only change while nothing references the unit. A `KG`
 *   measurement that became a `length` unit would be nonsense that no
 *   validation downstream could repair.
 * - `decimals` may be raised freely, but lowering it is rejected while any
 *   stored value — including one on a soft-deleted product row — needs more
 *   precision. An administrative edit must never invalidate captured data.
 * - Creating a code that a soft-deleted row still owns revives that row, which
 *   keeps its id and therefore its foreign keys.
 *
 * Every protection is enforced here *and* at the route, because the UI hiding a
 * control is not an authorization boundary.
 */
@injectable()
export class UnitOfMeasureService extends CrudService<any> {
  constructor(
    @inject(TOKENS.UnitOfMeasureRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.Prisma) private readonly prisma: any
  ) {
    super(repository, 'Unit of measure');
  }

  private get client(): any {
    return this.repository.client;
  }

  /** Codes are stored uppercase: MySQL compares them case-insensitively. */
  private normalizeCode(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === 'P2002';
  }

  private codeConflict(code: string): ConflictError {
    return new ConflictError(`A unit of measure with code '${code}' already exists`, UNIT_CODE_TAKEN, [
      {
        field: 'code',
        code: UNIT_CODE_TAKEN,
        params: { code },
        message: 'already used by another unit of measure'
      }
    ]);
  }

  /** Includes soft-deleted rows, which still own their unique code. */
  private async findByCode(code: string): Promise<any | null> {
    return this.client.unitOfMeasure.findFirst({ where: { code } });
  }

  /**
   * References from every code-based foreign key, soft-deleted rows included.
   *
   * `ProductPresentation.unitCode` plus the three specification columns are the
   * complete set: they are the only columns in the schema that point at
   * `unit_of_measures.code`.
   */
  private async countReferences(code: string): Promise<number> {
    const [presentations, specifications] = await Promise.all([
      this.prisma.productPresentation.count({ where: { unitCode: code } }),
      this.prisma.productSpecification.count({
        where: {
          OR: [{ weightUnitCode: code }, { lengthUnitCode: code }, { depthUnitCode: code }]
        }
      })
    ]);

    return presentations + specifications;
  }

  /**
   * Stored values that a proposed `decimals` could no longer represent, with the
   * field path of each one so the client can point at the offending data.
   */
  private async findValuesExceeding(
    code: string,
    decimals: number
  ): Promise<Array<{ field: string; value: string }>> {
    const offenders: Array<{ field: string; value: string }> = [];

    const presentations: any[] = await this.prisma.productPresentation.findMany({
      where: { unitCode: code },
      select: { id: true, quantity: true }
    });

    for (const row of presentations) {
      if (decimalPlacesOf(row.quantity) > decimals) {
        offenders.push({ field: `presentations.${row.id}.quantity`, value: String(row.quantity) });
      }
    }

    const specifications: any[] = await this.prisma.productSpecification.findMany({
      where: {
        OR: [{ weightUnitCode: code }, { lengthUnitCode: code }, { depthUnitCode: code }]
      },
      select: {
        id: true,
        weight: true,
        weightUnitCode: true,
        length: true,
        lengthUnitCode: true,
        depth: true,
        depthUnitCode: true
      }
    });

    const measurements = [
      { valueKey: 'weight', unitKey: 'weightUnitCode', path: 'measurements.weight.value' },
      { valueKey: 'length', unitKey: 'lengthUnitCode', path: 'measurements.length.value' },
      { valueKey: 'depth', unitKey: 'depthUnitCode', path: 'measurements.depth.value' }
    ] as const;

    for (const row of specifications) {
      for (const measurement of measurements) {
        if (row[measurement.unitKey] !== code) continue;
        if (decimalPlacesOf(row[measurement.valueKey]) > decimals) {
          offenders.push({ field: measurement.path, value: String(row[measurement.valueKey]) });
        }
      }
    }

    return offenders;
  }

  /**
   * A dimension may change only while the unit is unreferenced. Any reference,
   * including one on a soft-deleted row, locks it: the stored values were
   * captured as that dimension and no conversion may be invented for them.
   */
  private async assertDimensionChangeAllowed(
    code: string,
    currentDimension: string,
    nextDimension: unknown
  ): Promise<void> {
    if (nextDimension === undefined || nextDimension === null) return;
    if (String(nextDimension) === String(currentDimension)) return;

    const references = await this.countReferences(code);
    if (references === 0) return;

    throw new ValidationError(`Unit '${code}' is in use and its dimension cannot change`, [
      {
        field: 'dimension',
        code: UNIT_DIMENSION_LOCKED,
        params: { code, references },
        message: `referenced by ${references} stored record(s)`
      }
    ], UNIT_DIMENSION_LOCKED);
  }

  /**
   * Raising `decimals` is always safe; lowering it is rejected while any stored
   * value needs more precision.
   */
  private async assertDecimalsReductionAllowed(
    code: string,
    currentDecimals: number,
    nextDecimals: unknown
  ): Promise<void> {
    if (nextDecimals === undefined || nextDecimals === null) return;
    if (Number(nextDecimals) >= Number(currentDecimals)) return;

    const offenders = await this.findValuesExceeding(code, Number(nextDecimals));
    if (offenders.length === 0) return;

    throw new ValidationError(
      `Unit '${code}' cannot be reduced to ${nextDecimals} decimal place(s) while stored values need more precision`,
      offenders.slice(0, MAX_REPORTED_REFERENCES).map((offender) => ({
        field: offender.field,
        code: UNIT_PRECISION_EXCEEDED,
        params: { code, decimals: Number(nextDecimals), value: offender.value },
        message: `stored value ${offender.value} needs more decimals than ${nextDecimals}`
      })),
      UNIT_PRECISION_EXCEEDED
    );
  }

  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const code = this.normalizeCode(data.code);

    try {
      const existing = await this.findByCode(code);

      // A live row — active or merely inactive — never released its code. The
      // client reactivates it through PATCH instead of silently redefining it.
      if (existing && existing.deletedAt === null) throw this.codeConflict(code);

      if (existing) {
        // Revival: the row keeps its id, so every stored reference keeps
        // resolving, but an edit that would invalidate those same references is
        // still refused (the unit may be deleted *and* referenced).
        await this.assertDimensionChangeAllowed(code, existing.dimension, data.dimension);
        await this.assertDecimalsReductionAllowed(code, existing.decimals, data.decimals);

        return await this.client.unitOfMeasure.update({
          where: { id: existing.id },
          data: {
            code,
            name: data.name,
            symbol: data.symbol,
            dimension: data.dimension ?? existing.dimension,
            decimals: data.decimals ?? existing.decimals,
            status: (data.status as string) ?? 'active',
            deletedAt: null,
            ...auditUpdateFields(actor)
          }
        });
      }

      return await super.create(tenantId, { ...data, code }, actor);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.codeConflict(code);
      throw error;
    }
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);
    const payload: Record<string, unknown> = { ...data };

    if (payload.code !== undefined) {
      const nextCode = this.normalizeCode(payload.code);
      // A no-op resend is tolerated so the payload is not forced to omit the
      // field; an actual change is refused independently of the UI.
      if (nextCode !== existing.code) {
        throw new ValidationError('The code of a unit of measure cannot be changed', [
          {
            field: 'code',
            code: UNIT_CODE_IMMUTABLE,
            params: { code: existing.code },
            message: 'the code is immutable once the unit exists'
          }
        ], UNIT_CODE_IMMUTABLE);
      }
      delete payload.code;
    }

    await this.assertDimensionChangeAllowed(existing.code, existing.dimension, payload.dimension);
    await this.assertDecimalsReductionAllowed(existing.code, existing.decimals, payload.decimals);

    try {
      return await super.update(tenantId, id, payload, actor);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.codeConflict(existing.code);
      throw error;
    }
  }
}
