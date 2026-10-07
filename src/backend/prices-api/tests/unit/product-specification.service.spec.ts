import { runSeeds } from '../../prisma/seed/index';
import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import { TenantCrudRepository } from '../../src/common/crud/repository';
import { ProductSpecificationService } from '../../src/services/product-specification.service';
import { createFakePrisma } from '../helpers/fake-prisma';

const ACTOR = { id: '99999999-9999-4999-8999-999999999999', type: 'user' as const };

/** Valid GS1 values, all with correct check digits. */
const EAN_13_FIXTURE = '7501234567893'; // already used by SKU-DEMO-001
const EAN_8_FIXTURE = '12345670'; // already used by SKU-DEMO-001
const EAN_13_NEW = '7501234567800'; // free
const EAN_13_NEW_2 = '7501234567817'; // free

describe('ProductSpecificationService', () => {
  let prisma: any;
  let service: ProductSpecificationService;
  let tenantId: string;
  /** SKU-DEMO-001: seeded with a full specification. */
  let populated: any;
  /** SKU-DEMO-003: seeded with no specification at all. */
  let empty: any;

  beforeEach(async () => {
    prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo-company' } });
    tenantId = tenant.id;
    populated = await prisma.product.findFirst({ where: { tenantId, sku: 'SKU-DEMO-001' } });
    empty = await prisma.product.findFirst({ where: { tenantId, sku: 'SKU-DEMO-003' } });

    service = new ProductSpecificationService(
      prisma,
      new TenantCrudRepository(prisma, MODEL_OPTIONS.product)
    );
  });

  const brandNamed = async (name: string) =>
    (await prisma.brand.findFirst({ where: { tenantId, name } }))?.id;
  // Suppliers live in a global catalog: the name alone identifies the row.
  const supplierNamed = async (name: string) =>
    (await prisma.supplier.findFirst({ where: { name } }))?.id;

  function payload(overrides: Record<string, unknown> = {}): any {
    return {
      brandId: null,
      model: 'NEW-1',
      measurements: {},
      presentations: [],
      supplierIds: [],
      ...overrides
    };
  }

  function presentationWithIdentifier(value: string, overrides: Record<string, unknown> = {}): any {
    return {
      name: 'Caja',
      quantity: 1,
      unitCode: 'EA',
      identifiers: [{ type: 'ean_13', value }],
      ...overrides
    };
  }

  /** Captures the rejection so the contract code can be asserted precisely. */
  async function captureFailure(promise: Promise<unknown>): Promise<any> {
    let failure: any = null;
    try {
      await promise;
    } catch (error) {
      failure = error;
    }
    expect(failure).not.toBeNull();
    return failure;
  }

  // --- reads ---------------------------------------------------------------

  describe('getAggregate', () => {
    it('returns an empty aggregate for a product with no specification', async () => {
      const aggregate = await service.getAggregate(tenantId, empty.id);

      expect(aggregate.product).toEqual({ id: empty.id, sku: 'SKU-DEMO-003', name: empty.name });
      expect(aggregate.specification).toBeNull();
      expect(aggregate.presentations).toEqual([]);
      expect(aggregate.suppliers).toEqual([]);
    });

    it('returns the seeded aggregate with measurements, presentations, identifiers, and suppliers', async () => {
      const aggregate = await service.getAggregate(tenantId, populated.id);

      expect(aggregate.specification).toMatchObject({
        brandName: 'Acme',
        model: 'ACM-2026',
        measurements: {
          weight: { value: 1.25, unitCode: 'KG' },
          length: { value: 30, unitCode: 'CM' },
          depth: null // captured as NULL: "not captured", never zero
        }
      });

      expect(aggregate.presentations.map((item: any) => item.name)).toEqual(['Caja de 12', 'Unidad']);
      expect(aggregate.presentations[0].identifiers.map((item: any) => item.value)).toEqual([
        EAN_13_FIXTURE
      ]);
      expect(aggregate.presentations[1].identifiers.map((item: any) => item.value)).toEqual([
        EAN_8_FIXTURE
      ]);
      expect(aggregate.suppliers).toEqual([{ id: expect.any(String), name: 'Distribuidora Norte' }]);
    });

    it('returns identifiers in a deterministic order', async () => {
      // Two identifiers on one presentation, deliberately inserted out of order.
      await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({
          presentations: [
            {
              name: 'Caja',
              quantity: 1,
              unitCode: 'EA',
              identifiers: [
                { type: 'ean_13', value: EAN_13_NEW_2 },
                { type: 'ean_13', value: EAN_13_NEW }
              ]
            }
          ]
        }),
        ACTOR
      );

      const aggregate = await service.getAggregate(tenantId, empty.id);
      const values = aggregate.presentations[0].identifiers.map((item: any) => item.value);

      expect(values).toEqual([...values].sort());
    });

    it('rejects a missing product with 404 and never leaks a cross-tenant product', async () => {
      const missing = await captureFailure(
        service.getAggregate(tenantId, '11111111-1111-4111-8111-111111111111')
      );
      expect(missing.statusCode).toBe(404);

      // A second tenant's product must look exactly like a missing one.
      const other = await prisma.tenant.create({
        data: {
          commercialName: 'Other',
          legalName: 'Other',
          slug: 'other-company',
          defaultCurrency: 'MXN'
        }
      });
      const foreign = await prisma.product.create({
        data: {
          tenantId: other.id,
          sku: 'OTHER-1',
          name: 'Other product',
          basePrice: 1,
          currencyCode: 'MXN'
        }
      });

      const crossTenant = await captureFailure(service.getAggregate(tenantId, foreign.id));
      expect(crossTenant.statusCode).toBe(404);
    });

    it('requires tenant context', async () => {
      const failure = await captureFailure(service.getAggregate(null, empty.id));

      expect(failure.code).toBe('VALIDATION_ERROR');
    });
  });

  // --- replacement ---------------------------------------------------------

  describe('replaceAggregate', () => {
    it('creates the whole aggregate from empty and survives a re-read', async () => {
      const brandId = await brandNamed('Globex');
      const supplierId = await supplierNamed('Suministros del Valle');

      await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({
          brandId,
          model: 'GX-9',
          measurements: { weight: { value: 2.5, unitCode: 'KG' }, depth: { value: 4, unitCode: 'CM' } },
          presentations: [presentationWithIdentifier(EAN_13_NEW)],
          supplierIds: [supplierId]
        }),
        ACTOR
      );

      const aggregate = await service.getAggregate(tenantId, empty.id);

      expect(aggregate.specification).toMatchObject({
        brandId,
        brandName: 'Globex',
        model: 'GX-9',
        measurements: {
          weight: { value: 2.5, unitCode: 'KG' },
          length: null,
          depth: { value: 4, unitCode: 'CM' }
        }
      });
      expect(aggregate.presentations).toHaveLength(1);
      expect(aggregate.presentations[0]).toMatchObject({ name: 'Caja', quantity: 1, unitCode: 'EA' });
      expect(aggregate.presentations[0].identifiers[0]).toMatchObject({
        type: 'ean_13',
        value: EAN_13_NEW,
        normalizedValue: '07501234567800'
      });
      expect(aggregate.suppliers).toEqual([{ id: supplierId, name: 'Suministros del Valle' }]);
    });

    it('writes actor audit fields on every row it creates', async () => {
      await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({
          presentations: [presentationWithIdentifier(EAN_13_NEW)],
          supplierIds: [await supplierNamed('Distribuidora Norte')]
        }),
        ACTOR
      );

      const specification = await prisma.productSpecification.findFirst({
        where: { tenantId, productId: empty.id }
      });
      const presentation = await prisma.productPresentation.findFirst({
        where: { tenantId, productId: empty.id }
      });
      const identifier = await prisma.productIdentifier.findFirst({
        where: { tenantId, presentationId: presentation.id }
      });
      const link = await prisma.productSupplier.findFirst({ where: { tenantId, productId: empty.id } });

      for (const row of [specification, presentation, identifier, link]) {
        expect(row.createdBy).toBe(ACTOR.id);
        expect(row.createdByType).toBe('user');
        expect(row.updatedBy).toBe(ACTOR.id);
        expect(row.updatedByType).toBe('user');
      }
    });

    it('rejects a repeated body that carries barcodes but no child ids', async () => {
      // Two documented rules combine here: an omitted child id creates a NEW row,
      // and soft deletion never releases a barcode. So the second identical PUT
      // reuses nothing, while its barcode is still owned by the row the first PUT
      // soft-deleted — hence the conflict. Echoing the ids back is what makes a
      // repeated save idempotent, which is why the frontend must preserve them.
      const body = payload({ presentations: [presentationWithIdentifier(EAN_13_NEW)] });

      await service.replaceAggregate(tenantId, empty.id, body, ACTOR);

      const failure = await captureFailure(service.replaceAggregate(tenantId, empty.id, body, ACTOR));

      expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
      expect(failure.statusCode).toBe(409);
      expect(failure.details[0].field).toBe('presentations.0.identifiers.0.value');

      // The first save is intact and is still the only active presentation.
      const after = await service.getAggregate(tenantId, empty.id);
      expect(after.presentations).toHaveLength(1);
      expect(after.presentations[0].identifiers[0].value).toBe(EAN_13_NEW);
    });

    it('reuses the stored rows when the client echoes the returned ids', async () => {
      const created = await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({ presentations: [presentationWithIdentifier(EAN_13_NEW)] }),
        ACTOR
      );
      const presentationsBefore = prisma.__store.productPresentation.length;
      const identifiersBefore = prisma.__store.productIdentifier.length;

      await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({
          presentations: created.presentations.map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unitCode: item.unitCode,
            identifiers: item.identifiers.map((identifier: any) => ({
              id: identifier.id,
              type: identifier.type,
              value: identifier.value
            }))
          }))
        }),
        ACTOR
      );

      // Nothing new was created and nothing was soft-deleted.
      expect(prisma.__store.productPresentation).toHaveLength(presentationsBefore);
      expect(prisma.__store.productIdentifier).toHaveLength(identifiersBefore);
      expect(
        (await service.getAggregate(tenantId, empty.id)).presentations[0].id
      ).toBe(created.presentations[0].id);
    });

    it('soft-deletes active children omitted from the payload, with their identifiers', async () => {
      const before = await service.getAggregate(tenantId, populated.id);
      const kept = before.presentations[0];
      const dropped = before.presentations[1];

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({
          measurements: before.specification.measurements,
          presentations: [
            {
              id: kept.id,
              name: kept.name,
              quantity: kept.quantity,
              unitCode: kept.unitCode,
              identifiers: kept.identifiers.map((identifier: any) => ({
                id: identifier.id,
                type: identifier.type,
                value: identifier.value
              }))
            }
          ]
        }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.presentations.map((item: any) => item.id)).toEqual([kept.id]);

      const droppedRow = await prisma.productPresentation.findFirst({ where: { id: dropped.id } });
      expect(droppedRow.deletedAt).toBeInstanceOf(Date);
      expect(droppedRow.status).toBe('inactive');

      const droppedIdentifiers = await prisma.productIdentifier.findMany({
        where: { presentationId: dropped.id }
      });
      expect(droppedIdentifiers).toHaveLength(1);
      expect(droppedIdentifiers[0].deletedAt).toBeInstanceOf(Date);
    });

    it('revives a soft-deleted presentation sent back with its id', async () => {
      const before = await service.getAggregate(tenantId, populated.id);
      const dropped = before.presentations[1];

      // Drop it first.
      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({
          measurements: before.specification.measurements,
          presentations: [
            {
              id: before.presentations[0].id,
              name: before.presentations[0].name,
              quantity: 1,
              unitCode: 'EA',
              identifiers: []
            }
          ]
        }),
        ACTOR
      );

      // Send it back.
      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({
          measurements: before.specification.measurements,
          presentations: [
            { id: before.presentations[0].id, name: before.presentations[0].name, quantity: 1, unitCode: 'EA', identifiers: [] },
            { id: dropped.id, name: dropped.name, quantity: dropped.quantity, unitCode: 'EA', identifiers: [] }
          ]
        }),
        ACTOR
      );

      const revived = await prisma.productPresentation.findFirst({ where: { id: dropped.id } });
      expect(revived.deletedAt).toBeNull();
      expect(revived.status).toBe('active');

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.presentations).toHaveLength(2);
    });

    it('clears every supplier link when the payload sends an empty array', async () => {
      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ presentations: [] }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.suppliers).toEqual([]);

      const links = await prisma.productSupplier.findMany({ where: { tenantId, productId: populated.id } });
      expect(links).toHaveLength(1);
      expect(links[0].deletedAt).toBeInstanceOf(Date);
    });

    it('revives an existing soft-deleted supplier link instead of duplicating it', async () => {
      const supplierId = await supplierNamed('Distribuidora Norte');

      await service.replaceAggregate(tenantId, populated.id, payload({ presentations: [] }), ACTOR);
      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ presentations: [], supplierIds: [supplierId] }),
        ACTOR
      );

      const links = await prisma.productSupplier.findMany({ where: { tenantId, productId: populated.id } });
      expect(links).toHaveLength(1);
      expect(links[0].deletedAt).toBeNull();
    });

    it('allows re-submitting a soft-deleted brand that is already on the specification', async () => {
      const brandId = await brandNamed('Acme');
      await prisma.brand.update({ where: { id: brandId }, data: { deletedAt: new Date(), status: 'inactive' } });

      const before = await service.getAggregate(tenantId, populated.id);

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ brandId, measurements: before.specification.measurements, presentations: [] }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.specification.brandId).toBe(brandId);
      // The historical relation is kept, so the name still renders.
      expect(after.specification.brandName).toBe('Acme');
    });

    it('rejects assigning a soft-deleted brand that is not already on the specification', async () => {
      const brandId = await brandNamed('Globex');
      await prisma.brand.update({ where: { id: brandId }, data: { deletedAt: new Date(), status: 'inactive' } });

      const failure = await captureFailure(
        service.replaceAggregate(tenantId, empty.id, payload({ brandId }), ACTOR)
      );

      expect(failure.code).toBe('VALIDATION_ERROR');
      expect(failure.details[0].field).toBe('brandId');
    });

    it('rejects an unknown supplier', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ supplierIds: ['11111111-1111-4111-8111-111111111111'] }),
          ACTOR
        )
      );

      expect(failure.details[0].field).toBe('supplierIds');
    });
  });

  // --- the specific error contract ----------------------------------------

  describe('contract error codes', () => {
    it('reports UNIT_DIMENSION_MISMATCH when a length unit is used for weight', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ measurements: { weight: { value: 1, unitCode: 'CM' } } }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_DIMENSION_MISMATCH');
      expect(failure.statusCode).toBe(422);
      expect(failure.details[0].field).toBe('measurements.weight.unitCode');
      expect(failure.details[0].params).toMatchObject({ expected: 'mass', actual: 'length' });
    });

    it('reports UNIT_NOT_AVAILABLE for an unknown unit code', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ measurements: { length: { value: 1, unitCode: 'ZZ' } } }),
          ACTOR
        )
      );

      // "Unknown" is a problem of availability, not of dimension: the unit does
      // not exist at all, so the specific code says so.
      expect(failure.code).toBe('UNIT_NOT_AVAILABLE');
      expect(failure.statusCode).toBe(422);
      expect(failure.details[0].field).toBe('measurements.length.unitCode');
    });

    it('requires a count unit for a presentation quantity', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ presentations: [{ name: 'Caja', quantity: 1, unitCode: 'KG', identifiers: [] }] }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_DIMENSION_MISMATCH');
      expect(failure.details[0].field).toBe('presentations.0.unitCode');
    });

    it('reports INVALID_IDENTIFIER_CHECKSUM with the nested path of the bad value', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ presentations: [presentationWithIdentifier('7501234567890')] }),
          ACTOR
        )
      );

      expect(failure.code).toBe('INVALID_IDENTIFIER_CHECKSUM');
      expect(failure.details[0].field).toBe('presentations.0.identifiers.0.value');
      expect(failure.details[0].code).toBe('INVALID_IDENTIFIER_CHECKSUM');
    });

    it('reports IDENTIFIER_ALREADY_EXISTS when a barcode is stored on another product', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ presentations: [presentationWithIdentifier(EAN_13_FIXTURE)] }),
          ACTOR
        )
      );

      expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
      expect(failure.details[0].field).toBe('presentations.0.identifiers.0.value');
    });

    it('does not release a barcode when the owning presentation is soft-deleted', async () => {
      // Drop the seeded presentation that owns the EAN-13...
      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ presentations: [{ name: 'Unidad', quantity: 1, unitCode: 'EA', identifiers: [] }] }),
        ACTOR
      );

      // ...then try to reuse its barcode on another product.
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ presentations: [presentationWithIdentifier(EAN_13_FIXTURE)] }),
          ACTOR
        )
      );

      expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
    });

    it('rejects the same barcode twice within one payload', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({
            presentations: [
              presentationWithIdentifier(EAN_13_NEW),
              presentationWithIdentifier(EAN_13_NEW, { name: 'Otra' })
            ]
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
      expect(failure.details[0].field).toBe('presentations.1.identifiers.0.value');
    });

    it('reports DUPLICATE_PRESENTATION for a case-insensitive duplicate in the payload', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({
            presentations: [
              { name: 'Caja', quantity: 1, unitCode: 'EA', identifiers: [] },
              { name: 'caja', quantity: 2, unitCode: 'EA', identifiers: [] }
            ]
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('DUPLICATE_PRESENTATION');
      expect(failure.details[0].field).toBe('presentations.1.name');
    });

    it('allows reusing a stored name without its id, replacing that row', async () => {
      // Under full replacement the stored row is soft-deleted because it was
      // omitted, so its name is free for the incoming row. Rejecting this would
      // make "replace every presentation, I did not keep the ids" impossible.
      const before = await service.getAggregate(tenantId, populated.id);
      const storedId = before.presentations[0].id;

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({
          measurements: before.specification.measurements,
          presentations: [{ name: 'Caja de 12', quantity: 99, unitCode: 'EA', identifiers: [] }]
        }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);

      expect(after.presentations).toHaveLength(1);
      expect(after.presentations[0]).toMatchObject({ name: 'Caja de 12', quantity: 99 });
      // A different row: the original was replaced, not updated in place.
      expect(after.presentations[0].id).not.toBe(storedId);

      const rows = await prisma.productPresentation.findMany({
        where: { tenantId, productId: populated.id }
      });
      expect(rows.filter((row: any) => row.deletedAt === null)).toHaveLength(1);
      expect(rows.filter((row: any) => row.deletedAt !== null)).toHaveLength(2);
    });

    it('reports INVALID_CHILD_REFERENCE for a presentation id of another product', async () => {
      const other = await service.getAggregate(tenantId, populated.id);
      const foreignPresentationId = other.presentations[0].id;

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({
            presentations: [
              { id: foreignPresentationId, name: 'Caja', quantity: 1, unitCode: 'EA', identifiers: [] }
            ]
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('INVALID_CHILD_REFERENCE');
      expect(failure.details[0].field).toBe('presentations.0.id');
    });

    it('reports INVALID_CHILD_REFERENCE for an identifier id of another presentation', async () => {
      const aggregate = await service.getAggregate(tenantId, populated.id);
      const foreignIdentifierId = aggregate.presentations[0].identifiers[0].id;

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({
            presentations: [
              {
                name: 'Caja',
                quantity: 1,
                unitCode: 'EA',
                identifiers: [{ id: foreignIdentifierId, type: 'ean_13', value: EAN_13_NEW }]
              }
            ]
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('INVALID_CHILD_REFERENCE');
      expect(failure.details[0].field).toBe('presentations.0.identifiers.0.id');
    });
  });

  // --- transactional behaviour --------------------------------------------

  // --- availability and precision of the selected units -------------------

  describe('unit availability and precision', () => {
    /** Deactivates a unit without deleting it, as the admin screen would. */
    async function deactivate(code: string): Promise<void> {
      await prisma.unitOfMeasure.update({ where: { code }, data: { status: 'inactive' } });
    }

    async function deleteUnit(code: string): Promise<void> {
      await prisma.unitOfMeasure.update({
        where: { code },
        data: { status: 'inactive', deletedAt: new Date() }
      });
    }

    it('rejects a new assignment of a deactivated unit', async () => {
      await deactivate('KG');

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ measurements: { weight: { value: 1, unitCode: 'KG' } } }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_NOT_AVAILABLE');
      expect(failure.statusCode).toBe(422);
      expect(failure.details[0].field).toBe('measurements.weight.unitCode');
    });

    it('keeps a deactivated unit on the measurement that already stores it', async () => {
      const before = await service.getAggregate(tenantId, populated.id);
      await deactivate('KG');

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ brandId: before.specification.brandId, measurements: before.specification.measurements }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      // Dropping the code would silently reinterpret the stored value.
      expect(after.specification.measurements.weight).toEqual({ value: 1.25, unitCode: 'KG' });
    });

    it('keeps a soft-deleted unit on the measurement that already stores it', async () => {
      const before = await service.getAggregate(tenantId, populated.id);
      await deleteUnit('KG');

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ brandId: before.specification.brandId, measurements: before.specification.measurements }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.specification.measurements.weight).toEqual({ value: 1.25, unitCode: 'KG' });
    });

    it('does not extend the retention exception to a different measurement field', async () => {
      await deactivate('CM');

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          populated.id,
          payload({
            measurements: {
              // `length` may keep CM, but `depth` never stored it: reusing the
              // code there is a brand-new assignment of an unavailable unit.
              length: { value: 30, unitCode: 'CM' },
              depth: { value: 5, unitCode: 'CM' }
            }
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_NOT_AVAILABLE');
      expect(failure.details[0].field).toBe('measurements.depth.unitCode');
    });

    it('does not extend the retention exception to a new presentation', async () => {
      const before = await service.getAggregate(tenantId, populated.id);
      await deactivate('EA');

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          populated.id,
          payload({
            presentations: [
              ...before.presentations.map((item: any) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unitCode: item.unitCode,
                identifiers: item.identifiers
              })),
              { name: 'Nueva', quantity: 1, unitCode: 'EA', identifiers: [] }
            ]
          }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_NOT_AVAILABLE');
      expect(failure.details[0].field).toBe('presentations.2.unitCode');
    });

    it('rejects a quantity with more decimals than the unit allows', async () => {
      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ presentations: [{ name: 'Media', quantity: 1.5, unitCode: 'EA', identifiers: [] }] }),
          ACTOR
        )
      );

      // EA is a `count` unit with zero decimals: half a unit is not expressible.
      expect(failure.code).toBe('UNIT_PRECISION_EXCEEDED');
      expect(failure.statusCode).toBe(422);
      expect(failure.details[0].field).toBe('presentations.0.quantity');
    });

    it('rejects a measurement with more decimals than its unit allows', async () => {
      await prisma.unitOfMeasure.update({ where: { code: 'KG' }, data: { decimals: 1 } });

      const failure = await captureFailure(
        service.replaceAggregate(
          tenantId,
          empty.id,
          payload({ measurements: { weight: { value: 1.25, unitCode: 'KG' } } }),
          ACTOR
        )
      );

      expect(failure.code).toBe('UNIT_PRECISION_EXCEEDED');
      expect(failure.details[0].field).toBe('measurements.weight.value');
    });

    it('accepts a scale the unit can express', async () => {
      await service.replaceAggregate(
        tenantId,
        empty.id,
        payload({
          measurements: { weight: { value: 1.25, unitCode: 'KG' } },
          presentations: [{ name: 'Caja', quantity: 12, unitCode: 'EA', identifiers: [] }]
        }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, empty.id);
      expect(after.specification.measurements.weight).toEqual({ value: 1.25, unitCode: 'KG' });
      expect(after.presentations[0].quantity).toBe(12);
    });
  });

  // --- suppliers: availability of a *new* assignment ------------------------

  describe('supplier availability', () => {
    it('rejects a new assignment of a deactivated supplier', async () => {
      const supplierId = await supplierNamed('Distribuidora Norte');
      await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'inactive' } });

      const failure = await captureFailure(
        service.replaceAggregate(tenantId, empty.id, payload({ supplierIds: [supplierId] }), ACTOR)
      );

      expect(failure.statusCode).toBe(422);
      expect(failure.details[0].field).toBe('supplierIds');
    });

    it('rejects a new assignment of a soft-deleted supplier', async () => {
      const supplierId = await supplierNamed('Distribuidora Norte');
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { status: 'inactive', deletedAt: new Date() }
      });

      const failure = await captureFailure(
        service.replaceAggregate(tenantId, empty.id, payload({ supplierIds: [supplierId] }), ACTOR)
      );

      expect(failure.details[0].field).toBe('supplierIds');
    });

    it('keeps a live link to a supplier that was deactivated afterwards', async () => {
      const supplierId = await supplierNamed('Distribuidora Norte');
      await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'inactive' } });

      await service.replaceAggregate(
        tenantId,
        populated.id,
        payload({ supplierIds: [supplierId] }),
        ACTOR
      );

      const after = await service.getAggregate(tenantId, populated.id);
      expect(after.suppliers).toEqual([{ id: supplierId, name: 'Distribuidora Norte' }]);
    });

    it('does not let a soft-deleted link authorize a deactivated supplier', async () => {
      const supplierId = await supplierNamed('Distribuidora Norte');
      // The user removed the assignment earlier, and the supplier was
      // deactivated since. A removed link is not an existing assignment.
      await prisma.productSupplier.updateMany({
        where: { tenantId, productId: populated.id, supplierId },
        data: { status: 'inactive', deletedAt: new Date() }
      });
      await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'inactive' } });

      const failure = await captureFailure(
        service.replaceAggregate(tenantId, populated.id, payload({ supplierIds: [supplierId] }), ACTOR)
      );

      expect(failure.details[0].field).toBe('supplierIds');
    });
  });

  describe('transactional guarantees', () => {
    it('persists no partial changes when a write fails halfway', async () => {
      // The specification upsert happens before the identifier insert, so this
      // failure proves the surrounding transaction really rolls back.
      const originalCreate = prisma.productIdentifier.create;
      prisma.productIdentifier.create = async () => {
        throw new Error('boom during write');
      };

      try {
        const failure = await captureFailure(
          service.replaceAggregate(
            tenantId,
            empty.id,
            payload({ presentations: [presentationWithIdentifier(EAN_13_NEW)] }),
            ACTOR
          )
        );
        expect(failure.message).toBe('boom during write');
      } finally {
        prisma.productIdentifier.create = originalCreate;
      }

      expect(
        await prisma.productSpecification.count({ where: { tenantId, productId: empty.id } })
      ).toBe(0);
      expect(
        await prisma.productPresentation.count({ where: { tenantId, productId: empty.id } })
      ).toBe(0);
    });

    it('leaves the stored aggregate untouched when validation fails late', async () => {
      const before = JSON.stringify(prisma.__store.productSpecification);
      const aggregate = await service.getAggregate(tenantId, populated.id);

      await captureFailure(
        service.replaceAggregate(
          tenantId,
          populated.id,
          payload({
            measurements: { weight: { value: 1, unitCode: 'CM' } }, // fails dimension check
            presentations: aggregate.presentations.map((item: any) => ({
              id: item.id,
              name: item.name,
              quantity: 1,
              unitCode: 'EA',
              identifiers: []
            }))
          }),
          ACTOR
        )
      );

      expect(JSON.stringify(prisma.__store.productSpecification)).toBe(before);
    });

    it('maps a raced unique-constraint violation to the contract 409', async () => {
      const originalCreate = prisma.productIdentifier.create;
      prisma.productIdentifier.create = async () => {
        const error: any = new Error('Unique constraint failed');
        error.code = 'P2002';
        error.meta = { target: 'product_identifiers_tenant_id_normalized_value_key' };
        throw error;
      };

      try {
        const failure = await captureFailure(
          service.replaceAggregate(
            tenantId,
            empty.id,
            payload({ presentations: [presentationWithIdentifier(EAN_13_NEW)] }),
            ACTOR
          )
        );

        expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
        expect(failure.statusCode).toBe(409);
      } finally {
        prisma.productIdentifier.create = originalCreate;
      }
    });
  });

  // --- removal -------------------------------------------------------------

  describe('removeAggregate', () => {
    it('soft-deletes the aggregate and its children but never the product', async () => {
      await service.removeAggregate(tenantId, populated.id, ACTOR);

      const aggregate = await service.getAggregate(tenantId, populated.id);
      expect(aggregate.specification).toBeNull();
      expect(aggregate.presentations).toEqual([]);
      expect(aggregate.suppliers).toEqual([]);

      // The product itself is untouched: it is still resolvable through the
      // soft-delete-aware repository, which is what every other endpoint uses.
      const stillActive = await new TenantCrudRepository(prisma, MODEL_OPTIONS.product).findById(
        tenantId,
        populated.id
      );
      expect(stillActive).not.toBeNull();

      // Rows survive as inactive history rather than being deleted.
      expect(
        (await prisma.productSpecification.findMany({ where: { tenantId, productId: populated.id } }))[0]
          .deletedAt
      ).toBeInstanceOf(Date);
      expect(
        (await prisma.productIdentifier.findMany({ where: { tenantId, productId: populated.id } })).every(
          (row: any) => row.deletedAt instanceof Date
        )
      ).toBe(true);
    });

    it('is idempotent and keeps a cleared aggregate clear', async () => {
      await service.removeAggregate(tenantId, populated.id, ACTOR);
      await service.removeAggregate(tenantId, populated.id, ACTOR);

      const aggregate = await service.getAggregate(tenantId, populated.id);
      expect(aggregate.specification).toBeNull();
      expect(aggregate.presentations).toEqual([]);
    });
  });
});
