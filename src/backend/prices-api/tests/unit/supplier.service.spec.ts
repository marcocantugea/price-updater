import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import { TenantCrudRepository } from '../../src/common/crud/repository';
import { SUPPLIER_NAME_TAKEN, SupplierService } from '../../src/services/supplier.service';
import { createFakePrisma } from '../helpers/fake-prisma';

const ACTOR = { id: '99999999-9999-4999-8999-999999999999', type: 'user' as const };

/**
 * Lifecycle rules of the **global** supplier catalog: revival of a deleted row
 * on create, and a conflict — never a silent update — when the name belongs to a
 * live row. The catalog has no tenant, so the name is unique for every company.
 */
describe('SupplierService', () => {
  let prisma: any;
  let service: SupplierService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new SupplierService(new TenantCrudRepository(prisma, MODEL_OPTIONS.supplier));
  });

  /** Captures the rejection so the contract can be asserted precisely. */
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

  async function seedSupplier(overrides: Record<string, unknown> = {}): Promise<any> {
    await prisma.supplier.create({
      data: {
        name: 'Norte',
        status: 'active',
        deletedAt: null,
        createdBy: 'original-actor',
        createdByType: 'user',
        ...overrides
      }
    });

    return prisma.supplier.findFirst({ where: { name: overrides.name ?? 'Norte' } });
  }

  it('creates a supplier with a trimmed name', async () => {
    const created = await service.create(null, { name: '  Norte  ' }, ACTOR);

    expect(created).toMatchObject({ name: 'Norte', status: 'active' });
    expect(created.deletedAt).toBeNull();
    expect(created.createdBy).toBe(ACTOR.id);
  });

  it('rejects a name held by an active supplier with a field-level 409', async () => {
    await seedSupplier();

    const failure = await captureFailure(service.create(null, { name: 'Norte' }, ACTOR));

    expect(failure.statusCode).toBe(409);
    expect(failure.code).toBe(SUPPLIER_NAME_TAKEN);
    expect(failure.details).toEqual([
      expect.objectContaining({ field: 'name', code: SUPPLIER_NAME_TAKEN })
    ]);
    // Nothing was created and the existing row was not touched.
    expect(prisma.__store.supplier).toHaveLength(1);
  });

  it('treats an inactive but undeleted supplier as an active duplicate', async () => {
    // Deactivation is not deletion: the row never released its name, so POST is
    // still a conflict and reactivation is a PATCH.
    await seedSupplier({ status: 'inactive' });

    const failure = await captureFailure(service.create(null, { name: 'Norte' }, ACTOR));

    expect(failure.statusCode).toBe(409);
    expect(failure.code).toBe(SUPPLIER_NAME_TAKEN);
    expect(prisma.__store.supplier).toHaveLength(1);
  });

  it('revives a soft-deleted supplier on create, keeping the id and its links', async () => {
    const deleted = await seedSupplier({ deletedAt: new Date(), status: 'inactive' });
    const linkedProductId = '22222222-2222-4222-8222-222222222222';
    await prisma.productSupplier.create({
      data: { tenantId: '22222222-2222-4222-8222-222222222222', productId: linkedProductId, supplierId: deleted.id, status: 'inactive', deletedAt: new Date() }
    });

    const revived = await service.create(null, { name: 'Norte', status: 'active' }, ACTOR);

    expect(revived.id).toBe(deleted.id);
    expect(revived.deletedAt).toBeNull();
    expect(revived.status).toBe('active');
    // The original creator is preserved; only the update actor changes.
    expect(revived.createdBy).toBe('original-actor');
    expect(revived.updatedBy).toBe(ACTOR.id);
    expect(prisma.__store.supplier).toHaveLength(1);
    // The foreign key still points at the same supplier row.
    expect(prisma.__store.productSupplier[0].supplierId).toBe(deleted.id);
  });

  it('maps a unique-constraint race onto the same 409 contract', async () => {
    prisma.supplier.create = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    const failure = await captureFailure(service.create(null, { name: 'Norte' }, ACTOR));

    expect(failure.statusCode).toBe(409);
    expect(failure.code).toBe(SUPPLIER_NAME_TAKEN);
    expect(failure.details[0].field).toBe('name');
  });

  it('rejects renaming a supplier onto a name a deleted row still owns', async () => {
    const live = await seedSupplier({ name: 'Norte' });
    await seedSupplier({ name: 'Sur', deletedAt: new Date(), status: 'inactive' });

    const failure = await captureFailure(service.update(null, live.id, { name: 'Sur' }, ACTOR));

    // A deleted row cannot be renamed out of the way, so the honest answer is a
    // conflict: the client revives that supplier instead.
    expect(failure.statusCode).toBe(409);
    expect(failure.code).toBe(SUPPLIER_NAME_TAKEN);
    expect((await prisma.supplier.findFirst({ where: { id: live.id } })).name).toBe('Norte');
  });

  it('reactivates an inactive supplier through PATCH', async () => {
    const inactive = await seedSupplier({ status: 'inactive' });

    const updated = await service.update(null, inactive.id, { status: 'active' }, ACTOR);

    expect(updated.status).toBe('active');
    expect(updated.name).toBe('Norte');
  });

  it('tolerates a case-only resend of the same name', async () => {
    const supplier = await seedSupplier({ name: 'Norte' });

    const updated = await service.update(null, supplier.id, { name: 'NORTE' }, ACTOR);

    expect(updated.name).toBe('NORTE');
  });

  it('answers 404 for an unknown supplier id', async () => {
    await seedSupplier();

    const failure = await captureFailure(service.update(null, 'missing', { name: 'Otro' }, ACTOR));

    expect(failure.statusCode).toBe(404);
  });

  it('keeps one catalog for every company, so a name taken anywhere is taken', async () => {
    // Two "companies" writing to the same global catalog: the second one cannot
    // reuse the name, and it can see and edit the row the first one created.
    const first = await service.create(null, { name: 'Norte' }, ACTOR);

    const failure = await captureFailure(service.create(null, { name: 'Norte' }, ACTOR));
    expect(failure.code).toBe(SUPPLIER_NAME_TAKEN);

    const seenByAnotherCompany = await service.get(null, first.id);
    expect(seenByAnotherCompany.name).toBe('Norte');

    const renamed = await service.update(null, first.id, { name: 'Norte S.A.' }, ACTOR);
    expect(renamed.name).toBe('Norte S.A.');
  });
});
