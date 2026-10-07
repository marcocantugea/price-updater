import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import { TenantCrudRepository } from '../../src/common/crud/repository';
import {
  UNIT_CODE_IMMUTABLE,
  UNIT_CODE_TAKEN,
  UNIT_DIMENSION_LOCKED,
  UNIT_PRECISION_EXCEEDED
} from '../../src/common/errors/unit-error-codes';
import { UnitOfMeasureService } from '../../src/services/unit-of-measure.service';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const ACTOR = { id: '99999999-9999-4999-8999-999999999999', type: 'user' as const };

/**
 * Administrative rules of the global unit catalog.
 *
 * The catalog is shared by every company and referenced by foreign key through
 * `code`, so the interesting cases are the destructive edits: renaming a code,
 * re-dimensioning a unit, and tightening its decimals below the values already
 * captured in it.
 */
describe('UnitOfMeasureService', () => {
  let prisma: any;
  let service: UnitOfMeasureService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new UnitOfMeasureService(new TenantCrudRepository(prisma, MODEL_OPTIONS.unitOfMeasure), prisma);
  });

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

  async function seedUnit(overrides: Record<string, unknown> = {}): Promise<any> {
    const code = String(overrides.code ?? 'KG');

    await prisma.unitOfMeasure.create({
      data: {
        code,
        name: 'Kilogram',
        symbol: 'kg',
        dimension: 'mass',
        decimals: 3,
        status: 'active',
        deletedAt: null,
        createdBy: 'original-actor',
        createdByType: 'user',
        ...overrides
      }
    });

    return prisma.unitOfMeasure.findFirst({ where: { code } });
  }

  /** A presentation `quantity` stored with the given unit code. */
  async function seedPresentation(unitCode: string, quantity: unknown, overrides: Record<string, unknown> = {}) {
    await prisma.productPresentation.create({
      data: {
        id: `p-${unitCode}-${String(quantity)}`,
        tenantId: TENANT,
        productId: PRODUCT,
        name: `Presentation ${unitCode}`,
        quantity,
        unitCode,
        status: 'active',
        deletedAt: null,
        ...overrides
      }
    });
  }

  /** A specification measurement stored with the given unit code. */
  async function seedMeasurement(
    field: 'weight' | 'length' | 'depth',
    unitCode: string,
    value: unknown,
    overrides: Record<string, unknown> = {}
  ) {
    await prisma.productSpecification.create({
      data: {
        tenantId: TENANT,
        productId: PRODUCT,
        [`${field}UnitCode`]: unitCode,
        [field]: value,
        status: 'active',
        deletedAt: null,
        ...overrides
      }
    });
  }

  const createBody = (overrides: Record<string, unknown> = {}) => ({
    code: 'KG',
    name: 'Kilogram',
    symbol: 'kg',
    dimension: 'mass',
    decimals: 3,
    status: 'active',
    ...overrides
  });

  // --- create --------------------------------------------------------------

  describe('create', () => {
    it('normalizes the code to uppercase without padding', async () => {
      const created = await service.create(
        null,
        createBody({ code: '  kg2 ', name: 'Kilogram 2', symbol: 'kg2' }),
        ACTOR
      );

      expect(created.code).toBe('KG2');
      expect(created.createdBy).toBe(ACTOR.id);
    });

    it('rejects a code owned by a live row with a field-level 409', async () => {
      await seedUnit();

      const failure = await captureFailure(service.create(null, createBody(), ACTOR));

      expect(failure.statusCode).toBe(409);
      expect(failure.code).toBe(UNIT_CODE_TAKEN);
      expect(failure.details).toEqual([
        expect.objectContaining({ field: 'code', code: UNIT_CODE_TAKEN })
      ]);
      expect(prisma.__store.unitOfMeasure).toHaveLength(1);
    });

    it('treats an inactive but undeleted unit as a live duplicate', async () => {
      await seedUnit({ status: 'inactive' });

      const failure = await captureFailure(service.create(null, createBody(), ACTOR));

      expect(failure.code).toBe(UNIT_CODE_TAKEN);
      expect(prisma.__store.unitOfMeasure).toHaveLength(1);
    });

    it('revives a soft-deleted unit, keeping its id and its references', async () => {
      const deleted = await seedUnit({ deletedAt: new Date(), status: 'inactive' });
      await seedPresentation('KG', 1.5);

      const revived = await service.create(null, createBody({ name: 'Kilo', decimals: 2 }), ACTOR);

      expect(revived.id).toBe(deleted.id);
      expect(revived.deletedAt).toBeNull();
      expect(revived.name).toBe('Kilo');
      expect(revived.decimals).toBe(2);
      expect(revived.createdBy).toBe('original-actor');
      expect(prisma.__store.unitOfMeasure).toHaveLength(1);
      // The stored reference still resolves to the same row.
      expect(prisma.__store.productPresentation[0].unitCode).toBe('KG');
    });

    it('refuses to re-dimension a deleted unit that is still referenced', async () => {
      await seedUnit({ deletedAt: new Date(), status: 'inactive' });
      await seedPresentation('KG', 1);

      const failure = await captureFailure(
        service.create(null, createBody({ dimension: 'count' }), ACTOR)
      );

      expect(failure.statusCode).toBe(422);
      expect(failure.code).toBe(UNIT_DIMENSION_LOCKED);
      expect(failure.details[0].field).toBe('dimension');
    });

    it('maps a unique-constraint race onto the same 409 contract', async () => {
      prisma.unitOfMeasure.create = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      const failure = await captureFailure(service.create(null, createBody(), ACTOR));

      expect(failure.statusCode).toBe(409);
      expect(failure.code).toBe(UNIT_CODE_TAKEN);
    });
  });

  // --- update --------------------------------------------------------------

  describe('update', () => {
    it('rejects a code change but tolerates resending the same code', async () => {
      const unit = await seedUnit();

      const rejected = await captureFailure(service.update(null, unit.id, { code: 'LB' }, ACTOR));
      expect(rejected.statusCode).toBe(422);
      expect(rejected.code).toBe(UNIT_CODE_IMMUTABLE);
      expect(rejected.details[0].field).toBe('code');

      const tolerated = await service.update(null, unit.id, { code: ' kg ', name: 'Kilo' }, ACTOR);
      expect(tolerated.code).toBe('KG');
      expect(tolerated.name).toBe('Kilo');
    });

    it('locks the dimension while any stored record references the unit', async () => {
      const unit = await seedUnit();
      await seedPresentation('KG', 1);

      const failure = await captureFailure(service.update(null, unit.id, { dimension: 'count' }, ACTOR));

      expect(failure.statusCode).toBe(422);
      expect(failure.code).toBe(UNIT_DIMENSION_LOCKED);
    });

    it('locks the dimension for a soft-deleted reference too', async () => {
      const unit = await seedUnit({ code: 'EA', dimension: 'count', decimals: 0 });
      await seedPresentation('EA', 1, { deletedAt: new Date(), status: 'inactive' });

      const failure = await captureFailure(service.update(null, unit.id, { dimension: 'mass' }, ACTOR));

      // A soft-deleted row still holds the foreign key: allowing the change
      // would leave it describing a unit of the wrong dimension.
      expect(failure.code).toBe(UNIT_DIMENSION_LOCKED);
    });

    it('allows a dimension change while nothing references the unit', async () => {
      const unit = await seedUnit();

      const updated = await service.update(null, unit.id, { dimension: 'count' }, ACTOR);

      expect(updated.dimension).toBe('count');
    });

    it('refuses to tighten decimals below a stored value and reports the field path', async () => {
      const unit = await seedUnit();
      await seedMeasurement('weight', 'KG', 1.25);

      const failure = await captureFailure(service.update(null, unit.id, { decimals: 1 }, ACTOR));

      expect(failure.statusCode).toBe(422);
      expect(failure.code).toBe(UNIT_PRECISION_EXCEEDED);
      expect(failure.details[0]).toMatchObject({ field: 'measurements.weight.value' });
    });

    it('reports a presentation quantity that no longer fits', async () => {
      const unit = await seedUnit({ code: 'EA', dimension: 'count', decimals: 3 });
      await seedPresentation('EA', 1.5);

      const failure = await captureFailure(service.update(null, unit.id, { decimals: 0 }, ACTOR));

      expect(failure.code).toBe(UNIT_PRECISION_EXCEEDED);
      expect(failure.details[0].field).toMatch(/^presentations\..+\.quantity$/);
    });

    it('allows a reduction the stored values still fit', async () => {
      const unit = await seedUnit();
      await seedMeasurement('weight', 'KG', 1.25);

      const updated = await service.update(null, unit.id, { decimals: 2 }, ACTOR);

      expect(updated.decimals).toBe(2);
    });

    it('always allows raising decimals', async () => {
      const unit = await seedUnit({ code: 'EA', dimension: 'count', decimals: 0 });
      await seedPresentation('EA', 1);

      const updated = await service.update(null, unit.id, { decimals: 3 }, ACTOR);

      expect(updated.decimals).toBe(3);
    });

    it('answers 404 for an unknown unit', async () => {
      const failure = await captureFailure(service.update(null, 'missing', { name: 'X' }, ACTOR));

      expect(failure.statusCode).toBe(404);
    });
  });

  // --- delete --------------------------------------------------------------

  describe('remove', () => {
    it('soft-deletes and deactivates instead of dropping the row', async () => {
      const unit = await seedUnit();
      await seedPresentation('KG', 1.5);

      const removed = await service.remove(null, unit.id, ACTOR);

      expect(removed.deletedAt).not.toBeNull();
      expect(removed.status).toBe('inactive');
      // The row survives, so the stored foreign key stays valid.
      expect(prisma.__store.unitOfMeasure).toHaveLength(1);
      expect(prisma.__store.productPresentation[0].unitCode).toBe('KG');
    });
  });
});
