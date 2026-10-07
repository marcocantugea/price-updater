import { runSeeds } from '../../prisma/seed/index';
import { createFakePrisma } from '../helpers/fake-prisma';

/**
 * Contract tests for the product-specification models the double gained.
 *
 * The seed suite proves the seeds run; these pin the delegate behaviours the
 * seeds depend on (composite unique selectors, a composite primary key with no
 * surrogate id, and find-then-write on a table without a unique name).
 */
describe('fake-prisma: unit of measure', () => {
  it('upserts by the unique code and counts rows', async () => {
    const prisma = createFakePrisma();
    const unit = { code: 'KG', symbol: 'kg', dimension: 'mass', decimals: 3, status: 'active' };

    await prisma.unitOfMeasure.upsert({
      where: { code: 'KG' },
      update: { ...unit, name: 'Kilogram' },
      create: { ...unit, name: 'Kilogram' }
    });
    await prisma.unitOfMeasure.upsert({
      where: { code: 'KG' },
      update: { ...unit, name: 'Kilogramo' },
      create: { ...unit, name: 'Kilogram' }
    });

    expect(prisma.__store.unitOfMeasure).toHaveLength(1);
    expect(prisma.__store.unitOfMeasure[0].name).toBe('Kilogramo');
    expect(await prisma.unitOfMeasure.count()).toBe(1);
  });
});

describe('fake-prisma: composite unique selectors', () => {
  it('scopes brands by (tenantId, name) and revives a soft-deleted row', async () => {
    const prisma = createFakePrisma();

    const first = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId: 't1', name: 'Acme' } },
      update: { status: 'active', deletedAt: null },
      create: { tenantId: 't1', name: 'Acme', status: 'active' }
    });

    // The same name under another tenant is a different brand.
    const otherTenant = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId: 't2', name: 'Acme' } },
      update: { status: 'active', deletedAt: null },
      create: { tenantId: 't2', name: 'Acme', status: 'active' }
    });

    expect(otherTenant.id).not.toBe(first.id);
    expect(prisma.__store.brand).toHaveLength(2);

    // Simulate a soft delete, then re-run the seed: revived, never duplicated.
    const stored = prisma.__store.brand.find((row: any) => row.id === first.id);
    stored.deletedAt = new Date();
    const revived = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId: 't1', name: 'Acme' } },
      update: { status: 'active', deletedAt: null },
      create: { tenantId: 't1', name: 'Acme', status: 'active' }
    });

    expect(revived.id).toBe(first.id);
    expect(prisma.__store.brand).toHaveLength(2);
    expect(prisma.__store.brand.find((row: any) => row.id === first.id).deletedAt).toBeNull();
    expect(prisma.__store.brand.find((row: any) => row.id === first.id).status).toBe('active');
  });

  it('keeps one supplier per name, with no tenant in the way', async () => {
    const prisma = createFakePrisma();

    await prisma.supplier.upsert({
      where: { name: 'Distribuidora Norte' },
      update: { status: 'active', deletedAt: null },
      create: { name: 'Distribuidora Norte', status: 'active' }
    });
    const again = await prisma.supplier.upsert({
      where: { name: 'Distribuidora Norte' },
      update: { status: 'active', deletedAt: null },
      create: { name: 'Distribuidora Norte', status: 'active' }
    });

    // The catalog is global: the name alone identifies the row.
    expect(prisma.__store.supplier).toHaveLength(1);
    expect(again.name).toBe('Distribuidora Norte');
    expect(again).not.toHaveProperty('tenantId');
  });

  it('keeps one specification per (tenantId, productId)', async () => {
    const prisma = createFakePrisma();
    const create = { tenantId: 't1', productId: 'p1', model: 'ACM-2026', status: 'active' };

    const first = await prisma.productSpecification.upsert({
      where: { tenantId_productId: { tenantId: 't1', productId: 'p1' } },
      update: { model: 'ACM-2026' },
      create
    });
    const second = await prisma.productSpecification.upsert({
      where: { tenantId_productId: { tenantId: 't1', productId: 'p1' } },
      update: { model: 'ACM-2027' },
      create: { ...create, productId: 'p2' }
    });

    expect(second.id).toBe(first.id);
    expect(second.model).toBe('ACM-2027');
    expect(prisma.__store.productSpecification).toHaveLength(1);
  });

  it('keeps one identifier per (tenantId, normalizedValue)', async () => {
    const prisma = createFakePrisma();
    const where = { tenantId_normalizedValue: { tenantId: 't1', normalizedValue: '00075012345678' } };
    const create = {
      tenantId: 't1',
      productId: 'p1',
      presentationId: 'pres-1',
      type: 'ean_13',
      value: '7501234567893',
      normalizedValue: '00075012345678',
      status: 'active'
    };

    const first = await prisma.productIdentifier.upsert({ where, update: { ...create }, create });
    const second = await prisma.productIdentifier.upsert({
      where: { tenantId_normalizedValue: { tenantId: 't2', normalizedValue: '00075012345678' } },
      update: { ...create, tenantId: 't2' },
      create: { ...create, tenantId: 't2' }
    });

    expect(prisma.__store.productIdentifier).toHaveLength(2);
    expect(second.id).not.toBe(first.id);
  });
});

describe('fake-prisma: product presentation (no unique name)', () => {
  it('finds the active row, updates by id, and can recreate the same name', async () => {
    const prisma = createFakePrisma();
    const data = { tenantId: 't1', productId: 'p1', name: 'Caja de 12', quantity: 12, unitCode: 'EA', status: 'active' };

    const created = await prisma.productPresentation.create({ data });
    const found = await prisma.productPresentation.findFirst({
      where: { tenantId: 't1', productId: 'p1', name: 'Caja de 12', deletedAt: null }
    });
    expect(found.id).toBe(created.id);

    await prisma.productPresentation.update({ where: { id: created.id }, data: { quantity: 24 } });
    expect(prisma.__store.productPresentation[0].quantity).toBe(24);

    // A soft-deleted row of the same name is invisible to the active lookup and
    // does not block inserting a replacement.
    await prisma.productPresentation.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
    const active = await prisma.productPresentation.findFirst({
      where: { tenantId: 't1', productId: 'p1', name: 'Caja de 12', deletedAt: null }
    });
    expect(active).toBeNull();

    await prisma.productPresentation.create({ data });
    expect(prisma.__store.productPresentation).toHaveLength(2);
  });
});

describe('fake-prisma: product supplier composite primary key', () => {
  it('upserts on the natural triple and stores no surrogate id', async () => {
    const prisma = createFakePrisma();
    const where = { tenantId_productId_supplierId: { tenantId: 't1', productId: 'p1', supplierId: 's1' } };
    const create = { tenantId: 't1', productId: 'p1', supplierId: 's1', status: 'active' };

    const first = await prisma.productSupplier.upsert({
      where,
      update: { status: 'active', deletedAt: null },
      create
    });
    await prisma.productSupplier.update({ where, data: { deletedAt: new Date() } });
    await prisma.productSupplier.upsert({ where, update: { status: 'active', deletedAt: null }, create });

    expect(prisma.__store.productSupplier).toHaveLength(1);
    expect(prisma.__store.productSupplier[0]).not.toHaveProperty('id');
    expect(first).not.toHaveProperty('id');
    expect(prisma.__store.productSupplier[0].deletedAt).toBeNull();
  });
});

describe('fake-prisma: the new demo seeds', () => {
  it('populates the specification aggregate idempotently', async () => {
    const prisma = createFakePrisma();

    await runSeeds(prisma, { allowDemo: true });
    const afterFirst = {
      unitOfMeasure: prisma.__store.unitOfMeasure.length,
      brand: prisma.__store.brand.length,
      supplier: prisma.__store.supplier.length,
      productSpecification: prisma.__store.productSpecification.length,
      productPresentation: prisma.__store.productPresentation.length,
      productIdentifier: prisma.__store.productIdentifier.length,
      productSupplier: prisma.__store.productSupplier.length
    };

    expect(afterFirst).toEqual({
      unitOfMeasure: 10,
      brand: 2,
      supplier: 2,
      productSpecification: 1,
      productPresentation: 2,
      productIdentifier: 2,
      productSupplier: 1
    });

    await runSeeds(prisma, { allowDemo: true });

    expect({
      unitOfMeasure: prisma.__store.unitOfMeasure.length,
      brand: prisma.__store.brand.length,
      supplier: prisma.__store.supplier.length,
      productSpecification: prisma.__store.productSpecification.length,
      productPresentation: prisma.__store.productPresentation.length,
      productIdentifier: prisma.__store.productIdentifier.length,
      productSupplier: prisma.__store.productSupplier.length
    }).toEqual(afterFirst);
  });
});

describe('fake-prisma: $transaction rollback', () => {
  it('discards every write made before the callback throws', async () => {
    const prisma = createFakePrisma({
      brand: [{ id: 'b0', tenantId: 't1', name: 'Pre-existing', status: 'active', deletedAt: null }]
    });

    await expect(
      prisma.$transaction(async (tx: any) => {
        await tx.brand.create({ data: { tenantId: 't1', name: 'Leaked Brand' } });
        await tx.supplier.create({ data: { name: 'Leaked Supplier' } });
        await tx.productSupplier.create({
          data: { tenantId: 't1', productId: 'p1', supplierId: 's1' }
        });

        // Proves the writes really landed before the failure, so the assertions
        // below are testing a rollback and not an absent write.
        expect(tx.__store.brand).toHaveLength(2);
        expect(tx.__store.supplier).toHaveLength(1);

        throw new Error('validation failed halfway');
      })
    ).rejects.toThrow('validation failed halfway');

    // The aggregate PUT promises that an invalid request persists no partial
    // changes. This is the assertion that makes that promise testable.
    expect(prisma.__store.brand).toHaveLength(1);
    expect(prisma.__store.brand[0].name).toBe('Pre-existing');
    expect(prisma.__store.supplier).toHaveLength(0);
    expect(prisma.__store.productSupplier).toHaveLength(0);
  });

  it('keeps the writes when the callback resolves', async () => {
    const prisma = createFakePrisma();

    const result = await prisma.$transaction(async (tx: any) => {
      const brand = await tx.brand.create({ data: { tenantId: 't1', name: 'Committed Brand' } });
      return brand.id;
    });

    expect(typeof result).toBe('string');
    expect(prisma.__store.brand).toHaveLength(1);
    expect(prisma.__store.brand[0].name).toBe('Committed Brand');
  });

  it('restores updates and deletes too, not only inserts', async () => {
    const prisma = createFakePrisma({
      brand: [{ id: 'b1', tenantId: 't1', name: 'Original', status: 'active', deletedAt: null }]
    });

    await expect(
      prisma.$transaction(async (tx: any) => {
        await tx.brand.update({ where: { id: 'b1' }, data: { name: 'Renamed' } });
        await tx.brand.create({ data: { tenantId: 't1', name: 'Added' } });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(prisma.__store.brand).toHaveLength(1);
    expect(prisma.__store.brand[0].name).toBe('Original');
  });

  it('does not roll back a nested transaction independently of its caller', async () => {
    // Prisma has no real nested transaction here; the inner callback shares the
    // outer one. Pinning the behaviour stops a future refactor from silently
    // making the inner rollback discard the outer writes.
    const prisma = createFakePrisma();

    await expect(
      prisma.$transaction(async (tx: any) => {
        await tx.brand.create({ data: { tenantId: 't1', name: 'Outer' } });
        try {
          await tx.$transaction(async (inner: any) => {
            await inner.supplier.create({ data: { name: 'Inner' } });
            throw new Error('inner failure');
          });
        } catch {
          // swallowed, the outer transaction continues
        }
        throw new Error('outer failure');
      })
    ).rejects.toThrow('outer failure');

    expect(prisma.__store.brand).toHaveLength(0);
    expect(prisma.__store.supplier).toHaveLength(0);
  });

  it('still awaits the array form', async () => {
    const prisma = createFakePrisma();

    const results = await prisma.$transaction([
      prisma.brand.create({ data: { tenantId: 't1', name: 'A' } }),
      prisma.brand.create({ data: { tenantId: 't1', name: 'B' } })
    ]);

    expect(results).toHaveLength(2);
    expect(prisma.__store.brand).toHaveLength(2);
  });
});
