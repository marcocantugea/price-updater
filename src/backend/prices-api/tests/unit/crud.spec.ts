import { TenantCrudRepository } from '../../src/common/crud/repository';
import { CrudService } from '../../src/common/crud/service';
import { createCrudController, requireActor, requireTenant } from '../../src/common/crud/controller';
import { createCrudRouter, createReadOnlyRouter } from '../../src/common/crud/router';
import { NotFoundError, UnauthorizedError } from '../../src/common/errors';
import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import type { CrudModelOptions } from '../../src/common/crud/types';
import { createFakePrisma, matchCondition } from '../helpers/fake-prisma';
import { mockRequest, mockResponse, runHandler } from '../helpers/http';

const OPTIONS: CrudModelOptions = {
  model: 'product',
  tenantScoped: true,
  hasDeletedAt: true,
  searchableFields: ['sku', 'name'],
  filterableFields: ['status', 'currencyCode'],
  defaultSortField: 'createdAt'
};

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function buildRepository() {
  const prisma = createFakePrisma({
    product: [
      {
        id: 'p1',
        tenantId: TENANT_A,
        sku: 'SKU-1',
        name: 'Cafetera',
        basePrice: 100,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-01-01')
      },
      {
        id: 'p2',
        tenantId: TENANT_A,
        sku: 'SKU-2',
        name: 'Tostadora',
        basePrice: 200,
        currencyCode: 'USD',
        status: 'inactive',
        deletedAt: null,
        createdAt: new Date('2024-02-01')
      },
      {
        id: 'p3',
        tenantId: TENANT_A,
        sku: 'SKU-3',
        name: 'Borrada',
        basePrice: 300,
        currencyCode: 'MXN',
        status: 'inactive',
        deletedAt: new Date('2024-03-01'),
        createdAt: new Date('2024-03-01')
      },
      {
        id: 'p9',
        tenantId: TENANT_B,
        sku: 'SKU-9',
        name: 'Otro tenant',
        basePrice: 900,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-04-01')
      }
    ]
  });

  return { prisma, repository: new TenantCrudRepository(prisma, OPTIONS) };
}

const listQuery = (overrides: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  order: 'desc' as const,
  ...overrides
});

describe('TenantCrudRepository — multi-tenant isolation', () => {
  it('only lists rows of the resolved tenant', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery());

    expect(result.data.map((row: any) => row.id).sort()).toEqual(['p1', 'p2']);
    expect(result.meta.total).toBe(2);
  });

  it('excludes soft-deleted rows', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery());

    expect(result.data.some((row: any) => row.id === 'p3')).toBe(false);
  });

  it('returns null when reading another tenant record', async () => {
    const { repository } = buildRepository();
    await expect(repository.findById(TENANT_A, 'p9')).resolves.toBeNull();
    await expect(repository.findById(TENANT_B, 'p9')).resolves.toBeTruthy();
  });

  it('refuses to update a record from another tenant', async () => {
    const { repository } = buildRepository();
    const actor = { id: 'u1', type: 'user' as const };

    await expect(repository.update(TENANT_A, 'p9', { name: 'hack' }, actor)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('refuses to delete a record from another tenant', async () => {
    const { repository } = buildRepository();
    await expect(
      repository.softDelete(TENANT_A, 'p9', { id: 'u1', type: 'user' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TenantCrudRepository — filtering, search and pagination', () => {
  it('searches across the configured searchable fields', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ search: 'tost' }));

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).id).toBe('p2');
  });

  it('filters by status', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ status: 'inactive' }));

    expect(result.data.map((row: any) => row.id)).toEqual(['p2']);
  });

  it('filters by configured filterable fields', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ currencyCode: 'MXN' }));

    expect(result.data.map((row: any) => row.id)).toEqual(['p1']);
  });

  it('paginates and reports metadata', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ page: 2, limit: 1, sort: 'name', order: 'asc' }));

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it('ignores a sort field that is not allow-listed', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ sort: 'basePrice' }));

    // Falls back to defaultSortField (createdAt) descending.
    expect((result.data[0] as any).id).toBe('p2');
  });

  it('counts and reads unpaginated rows', async () => {
    const { repository } = buildRepository();

    await expect(repository.count(TENANT_A)).resolves.toBe(2);
    await expect(repository.count(TENANT_A, { status: 'active' })).resolves.toBe(1);
    await expect(repository.findMany(TENANT_A, { status: 'active' })).resolves.toHaveLength(1);
  });
});

/**
 * Product cost (`Product.cost`).
 *
 * The cost is a plain nullable column: it rides on the generic CRUD repository,
 * which spreads the validated body into Prisma. The double stores raw values, so
 * these specs assert the persistence contract (which keys reach the database and
 * what value they carry) while `Decimal` -> number serialization is covered in
 * `utils.spec.ts` with a real `Prisma.Decimal`.
 */
describe('TenantCrudRepository — product cost persistence', () => {
  const ACTOR = { id: 'user-cost', type: 'user' as const };

  it('creates a product with a cost', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-COST', name: 'Con costo', basePrice: 150, cost: 90, currencyCode: 'MXN' },
      ACTOR
    );

    expect(created.cost).toBe(90);
  });

  it('creates a product without a cost as NULL, not zero', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-NOCOST', name: 'Sin costo', basePrice: 200, currencyCode: 'MXN' },
      ACTOR
    );

    // An omitted cost must never be coerced into a real zero cost.
    expect(created.cost).toBeUndefined();
    expect(created.cost).not.toBe(0);
  });

  it('creates a product with an explicit null cost', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-NULLCOST', name: 'Nulo', basePrice: 200, cost: null, currencyCode: 'MXN' },
      ACTOR
    );

    expect(created.cost).toBeNull();
  });

  it('updates only the cost', async () => {
    const { repository } = buildRepository();

    const updated: any = await repository.update(TENANT_A, 'p1', { cost: 95.5 }, ACTOR);

    expect(updated.cost).toBe(95.5);
    // Unrelated fields are untouched by a cost-only patch.
    expect(updated.name).toBe('Cafetera');
    expect(updated.basePrice).toBe(100);
  });

  it('clears a known cost with null', async () => {
    const { repository } = buildRepository();
    await repository.update(TENANT_A, 'p1', { cost: 90 }, ACTOR);

    const cleared: any = await repository.update(TENANT_A, 'p1', { cost: null }, ACTOR);

    expect(cleared.cost).toBeNull();
  });

  it('preserves the current cost when the patch omits it', async () => {
    const { repository } = buildRepository();
    // p1 pre-exists for the tenant, so the patch below is a true partial update.
    await repository.update(TENANT_A, 'p1', { cost: 90 }, ACTOR);

    const renamed: any = await repository.update(TENANT_A, 'p1', { name: 'Renombrada' }, ACTOR);

    expect(renamed.name).toBe('Renombrada');
    expect(renamed.cost).toBe(90);

    // And the value really is still in the database after the omitted field.
    const reread: any = await repository.findById(TENANT_A, 'p1');
    expect(reread.cost).toBe(90);
  });

  it('stores a real zero cost as zero', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-ZERO', name: 'Costo cero', basePrice: 150, cost: 0, currencyCode: 'MXN' },
      ACTOR
    );

    expect(created.cost).toBe(0);
    expect(created.cost).not.toBeNull();
  });

  it('keeps cost tenant-isolated', async () => {
    const { repository } = buildRepository();

    const other: any = await repository.create(
      TENANT_B,
      { sku: 'SKU-B', name: 'Otro tenant', basePrice: 10, cost: 4, currencyCode: 'MXN' },
      ACTOR
    );

    const rowsOfA = await repository.list(TENANT_A, listQuery());
    expect(rowsOfA.data.some((row: any) => row.sku === 'SKU-B')).toBe(false);

    const rowsOfB = await repository.list(TENANT_B, listQuery());
    expect(rowsOfB.data.map((row: any) => row.id)).toContain(other.id);

    // A cross-tenant write resolves to 404 and never touches the cost.
    await expect(repository.update(TENANT_A, other.id, { cost: 999 }, ACTOR)).rejects.toBeInstanceOf(
      NotFoundError
    );
    const untouched: any = await repository.findById(TENANT_B, other.id);
    expect(untouched.cost).toBe(4);
  });
});

/**
 * Relation-aware search (`searchWhere`).
 *
 * `Price` and `PriceHistory` carry their text on the related product, so the
 * generic builder cannot use `searchableFields`. These specs use the real
 * `MODEL_OPTIONS` so the assertion cannot drift from the shipped configuration.
 */
describe('TenantCrudRepository — relation-aware product search', () => {
  const buildPriceRepository = () => {
    const prisma = createFakePrisma({
      product: [
        { id: 'prod-cafe', tenantId: TENANT_A, sku: 'CAFE-1000', name: 'Cafetera', status: 'active', deletedAt: null },
        { id: 'prod-tost', tenantId: TENANT_A, sku: 'TOST-2000', name: 'Tostadora', status: 'active', deletedAt: null },
        { id: 'prod-borrada', tenantId: TENANT_A, sku: 'VIEJA-9999', name: 'Cafetera vieja', status: 'active', deletedAt: new Date('2024-05-01') },
        { id: 'prod-otro', tenantId: TENANT_B, sku: 'OTRA-7777', name: 'Cafetera de otra empresa', status: 'active', deletedAt: null }
      ],
      price: [
        { id: 'price-cafe', tenantId: TENANT_A, productId: 'prod-cafe', basePrice: 100, currencyCode: 'MXN', status: 'active', deletedAt: null, notes: 'sin coincidencia', createdAt: new Date('2024-01-01') },
        { id: 'price-tost', tenantId: TENANT_A, productId: 'prod-tost', basePrice: 200, currencyCode: 'MXN', status: 'active', deletedAt: null, notes: 'promo de temporada', createdAt: new Date('2024-02-01') },
        { id: 'price-tost-inactive', tenantId: TENANT_A, productId: 'prod-tost', basePrice: 210, currencyCode: 'MXN', status: 'inactive', deletedAt: null, notes: null, createdAt: new Date('2024-02-02') },
        { id: 'price-notas', tenantId: TENANT_A, productId: 'prod-cafe', basePrice: 300, currencyCode: 'MXN', status: 'active', deletedAt: null, notes: 'liquidacion', createdAt: new Date('2024-03-01') },
        { id: 'price-borrada', tenantId: TENANT_A, productId: 'prod-borrada', basePrice: 400, currencyCode: 'MXN', status: 'active', deletedAt: new Date('2024-04-01'), notes: null, createdAt: new Date('2024-04-01') },
        { id: 'price-otro', tenantId: TENANT_B, productId: 'prod-otro', basePrice: 500, currencyCode: 'MXN', status: 'active', deletedAt: null, notes: null, createdAt: new Date('2024-05-01') }
      ],
      priceHistory: [
        { id: 'hist-cafe', tenantId: TENANT_A, priceId: 'price-cafe', productId: 'prod-cafe', reason: 'created', newBasePrice: 100, createdAt: new Date('2024-01-01') },
        { id: 'hist-tost', tenantId: TENANT_A, priceId: 'price-tost', productId: 'prod-tost', reason: 'created', newBasePrice: 200, createdAt: new Date('2024-02-01') },
        { id: 'hist-otro', tenantId: TENANT_B, priceId: 'price-otro', productId: 'prod-otro', reason: 'created', newBasePrice: 500, createdAt: new Date('2024-03-01') }
      ]
    });

    return {
      prisma,
      price: new TenantCrudRepository(prisma, MODEL_OPTIONS['price']),
      priceHistory: new TenantCrudRepository(prisma, MODEL_OPTIONS['priceHistory'])
    };
  };

  it('searches prices by the related product SKU', async () => {
    const { price } = buildPriceRepository();
    // Two different products match: the second price of the same product is
    // returned too, because the predicate is on the product, not the price.
    const result = await price.list(TENANT_A, listQuery({ search: 'CAFE-', limit: 100 }));

    expect(result.data.map((row: any) => row.id).sort()).toEqual(['price-cafe', 'price-notas']);
    expect(result.meta.total).toBe(2);
  });

  it('matches a SKU by prefix and reports every price of the matching product', async () => {
    const { price } = buildPriceRepository();
    const result = await price.list(TENANT_A, listQuery({ search: 'CAFE-100' }));

    // `contains`, not a prefix match: "CAFE-100" is inside "CAFE-1000", and the
    // second price of the same product also matches.
    expect(result.data.map((row: any) => row.id).sort()).toEqual(['price-cafe', 'price-notas']);
  });

  it('searches prices by the related product name', async () => {
    const { price } = buildPriceRepository();
    const result = await price.list(TENANT_A, listQuery({ search: 'tostadora', limit: 100 }));

    expect(result.data.map((row: any) => row.id).sort()).toEqual(['price-tost', 'price-tost-inactive']);
  });

  it('matches the SKU as a case-insensitive substring', async () => {
    const { price } = buildPriceRepository();
    const result = await price.list(TENANT_A, listQuery({ search: 'cafe-', limit: 100 }));

    // Both prices of the matching product; the price whose product is
    // soft-deleted is excluded.
    expect(result.data.map((row: any) => row.id).sort()).toEqual(['price-cafe', 'price-notas']);
  });

  it('does not match text that only exists in the price notes', async () => {
    const { price } = buildPriceRepository();

    for (const search of ['liquidacion', 'temporada']) {
      const result = await price.list(TENANT_A, listQuery({ search }));
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    }
  });

  it('keeps status, soft-delete and tenant constraints outside the OR block', async () => {
    const { price } = buildPriceRepository();

    // Two prices of the *same* product, with different statuses. Without a
    // status filter both match; the filter narrows the same OR block.
    const active = await price.list(TENANT_A, listQuery({ search: 'tost' }));
    expect(active.data.map((row: any) => row.id).sort()).toEqual(['price-tost', 'price-tost-inactive']);

    const activeOnly = await price.list(TENANT_A, listQuery({ search: 'tost', status: 'active' }));
    expect(activeOnly.data.map((row: any) => row.id)).toEqual(['price-tost']);

    const inactiveOnly = await price.list(TENANT_A, listQuery({ search: 'tost', status: 'inactive' }));
    expect(inactiveOnly.data.map((row: any) => row.id)).toEqual(['price-tost-inactive']);

    // The soft-deleted product is never returned, even though its SKU matches.
    const all = await price.list(TENANT_A, listQuery({ search: 'cafe-', limit: 100 }));
    expect(all.data.map((row: any) => row.id)).not.toContain('price-borrada');

    // A row from another company is filtered by tenant before the OR is applied.
    const otherTenant = await price.list(TENANT_B, listQuery({ search: 'OTRA-' }));
    expect(otherTenant.data.map((row: any) => row.id)).toEqual(['price-otro']);
    const ownTenant = await price.list(TENANT_A, listQuery({ search: 'OTRA-' }));
    expect(ownTenant.data).toEqual([]);
  });

  it('builds the documented OR clause and keeps base predicates at the root', () => {
    const { price, priceHistory } = buildPriceRepository();

    const where = price.buildWhere(TENANT_A, listQuery({ search: 'ABC-123', status: 'active' }));

    expect(where['OR']).toEqual([
      { product: { is: { sku: { contains: 'ABC-123' } } } },
      { product: { is: { name: { contains: 'ABC-123' } } } }
    ]);
    expect(where['tenantId']).toBe(TENANT_A);
    expect(where['deletedAt']).toBeNull();
    expect(where['status']).toBe('active');

    // The history model has no status column, so no status predicate is added.
    const historyWhere = priceHistory.buildWhere(TENANT_A, listQuery({ search: 'ABC-123', status: 'active' }));
    expect(Object.keys(historyWhere).sort()).toEqual(['OR', 'tenantId']);
  });

  it('omits the OR clause for an empty or whitespace-only term', () => {
    const { price } = buildPriceRepository();

    for (const search of ['', '   ', '\t\n']) {
      const where = price.buildWhere(TENANT_A, listQuery({ search }));
      expect(where['OR']).toBeUndefined();
    }

    expect(price.buildWhere(TENANT_A, listQuery())['OR']).toBeUndefined();
  });

  it('trims the term before it reaches the query', () => {
    const { price } = buildPriceRepository();
    expect(price.buildWhere(TENANT_A, listQuery({ search: '  CAFE-1000  ' }))['OR']).toEqual([
      { product: { is: { sku: { contains: 'CAFE-1000' } } } },
      { product: { is: { name: { contains: 'CAFE-1000' } } } }
    ]);
  });

  it('searches price history by the related product instead of the reason', async () => {
    const { priceHistory } = buildPriceRepository();

    const bySku = await priceHistory.list(TENANT_A, listQuery({ search: 'TOST-2000' }));
    expect(bySku.data.map((row: any) => row.id)).toEqual(['hist-tost']);

    const byName = await priceHistory.list(TENANT_A, listQuery({ search: 'cafetera' }));
    expect(byName.data.map((row: any) => row.id)).toEqual(['hist-cafe']);

    // `reason` is no longer part of the toolbar search.
    const byReason = await priceHistory.list(TENANT_A, listQuery({ search: 'created' }));
    expect(byReason.data).toEqual([]);
    expect(byReason.meta.total).toBe(0);

    // Tenant isolation holds for history too.
    const crossTenant = await priceHistory.list(TENANT_A, listQuery({ search: 'OTRA-' }));
    expect(crossTenant.data).toEqual([]);
    const ownTenant = await priceHistory.list(TENANT_B, listQuery({ search: 'OTRA-' }));
    expect(ownTenant.data.map((row: any) => row.id)).toEqual(['hist-otro']);
  });

  it('paginates the filtered rows and reports the filtered total', async () => {
    const { price } = buildPriceRepository();

    const first = await price.list(TENANT_A, listQuery({ search: 'cafe-', page: 1, limit: 1 }));
    const second = await price.list(TENANT_A, listQuery({ search: 'cafe-', page: 2, limit: 1 }));

    expect(first.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(second.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect((first.data[0] as any).id).not.toBe((second.data[0] as any).id);
  });

  it('drops the old searchable fields from the effective sort', async () => {
    const { price } = buildPriceRepository();

    // `notes` and `reason` used to be `searchableFields`, which also made them
    // sortable. An unknown sort field must fall back to the default field
    // (createdAt) while still honouring the requested direction.
    const byNotes = await price.list(TENANT_A, listQuery({ search: 'cafe-', sort: 'notes', order: 'asc' }));
    const byDefault = await price.list(TENANT_A, listQuery({ search: 'cafe-', order: 'asc' }));

    expect(byNotes.data.map((row: any) => row.id)).toEqual(['price-cafe', 'price-notas']);
    expect(byNotes.data.map((row: any) => row.id)).toEqual(byDefault.data.map((row: any) => row.id));

    // A still-valid sort field keeps working.
    const byCreatedAt = await price.list(TENANT_A, listQuery({ search: 'cafe-', sort: 'createdAt', order: 'asc' }));
    expect(byCreatedAt.data.map((row: any) => row.id)).toEqual(['price-cafe', 'price-notas']);
  });
});

describe('fake-prisma relation matching', () => {
  it('resolves a nested relation predicate through the belongsTo mapping', async () => {
    const prisma = createFakePrisma({
      product: [
        { id: 'p-match', tenantId: TENANT_A, sku: 'ABC-1', name: 'Coincide', deletedAt: null },
        { id: 'p-other', tenantId: TENANT_A, sku: 'XYZ-9', name: 'Otra', deletedAt: null }
      ],
      price: [
        { id: 'price-match', tenantId: TENANT_A, productId: 'p-match', createdAt: new Date('2024-01-01') },
        { id: 'price-other', tenantId: TENANT_A, productId: 'p-other', createdAt: new Date('2024-01-02') },
        { id: 'price-huerfano', tenantId: TENANT_A, productId: 'p-missing', createdAt: new Date('2024-01-03') }
      ]
    });

    const rows = await prisma.price.findMany({
      where: { OR: [{ product: { is: { sku: { contains: 'ABC' } } } }] }
    });

    // The orphan row has no related product, so the predicate must be false.
    expect(rows.map((row: any) => row.id)).toEqual(['price-match']);
  });

  it('supports is: null and isNot on a to-one relation', async () => {
    const prisma = createFakePrisma({
      product: [{ id: 'p-1', tenantId: TENANT_A, sku: 'ABC-1', name: 'Coincide', deletedAt: null }],
      price: [
        { id: 'price-linked', tenantId: TENANT_A, productId: 'p-1', createdAt: new Date('2024-01-01') },
        { id: 'price-huerfano', tenantId: TENANT_A, productId: 'p-missing', createdAt: new Date('2024-01-02') }
      ]
    });

    const withRelation = await prisma.price.findMany({ where: { product: { isNot: null } } });
    expect(withRelation.map((row: any) => row.id)).toEqual(['price-linked']);

    const withoutRelation = await prisma.price.findMany({ where: { product: { is: null } } });
    expect(withoutRelation.map((row: any) => row.id)).toEqual(['price-huerfano']);

    const notMatching = await prisma.price.findMany({
      where: { product: { isNot: { sku: { contains: 'ABC' } } } }
    });
    // Only the orphan row is "not a product whose sku contains ABC".
    expect(notMatching.map((row: any) => row.id)).toEqual(['price-huerfano']);
  });

  it('fails loudly on a filter it cannot evaluate', () => {
    // Asserted at the matcher level: a delegate call would have to traverse a
    // full model fixture to reach the same branch.
    expect(() =>
      matchCondition(10, { modulo: 10 }, { store: {}, model: 'price', strict: true })
    ).toThrow(/cannot evaluate filter 'modulo'/);
  });
});

describe('TenantCrudRepository — writes, audit and soft delete', () => {
  it('stamps tenant and audit columns on create', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-NEW', name: 'Nueva', basePrice: 10, currencyCode: 'MXN' },
      { id: 'user-9', type: 'user' }
    );

    expect(created.tenantId).toBe(TENANT_A);
    expect(created.createdBy).toBe('user-9');
    expect(created.createdByType).toBe('user');
    expect(created.updatedBy).toBe('user-9');
  });

  it('records the api_key actor for key-driven writes', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-KEY', name: 'Key', basePrice: 1, currencyCode: 'MXN' },
      { id: 'key-1', type: 'api_key' }
    );

    expect(created.createdByType).toBe('api_key');
  });

  it('stamps updatedBy on update', async () => {
    const { repository } = buildRepository();
    const updated: any = await repository.update(
      TENANT_A,
      'p1',
      { name: 'Renombrada' },
      { id: 'user-2', type: 'user' }
    );

    expect(updated.name).toBe('Renombrada');
    expect(updated.updatedBy).toBe('user-2');
  });

  it('soft deletes by stamping deletedAt and deactivating', async () => {
    const { repository } = buildRepository();
    const removed: any = await repository.softDelete(TENANT_A, 'p1', { id: 'user-3', type: 'user' });

    expect(removed.deletedAt).toBeInstanceOf(Date);
    expect(removed.status).toBe('inactive');

    const listed = await repository.list(TENANT_A, listQuery());
    expect(listed.data.some((row: any) => row.id === 'p1')).toBe(false);
  });

  it('supports models without a deletedAt column', async () => {
    const prisma = createFakePrisma({
      priceHistory: [{ id: 'h1', tenantId: TENANT_A, reason: 'create' }]
    });
    const repository = new TenantCrudRepository(prisma, {
      model: 'priceHistory',
      tenantScoped: true,
      hasDeletedAt: false,
      hasStatus: false,
      searchableFields: ['reason'],
      filterableFields: [],
      defaultSortField: 'createdAt'
    });

    const listed = await repository.list(TENANT_A, listQuery());
    expect(listed.data).toHaveLength(1);
  });

  it('skips the status filter for models without a status column', async () => {
    const prisma = createFakePrisma({
      permission: [{ id: 'perm-1', slug: 'products:read', name: 'Read' }]
    });
    const repository = new TenantCrudRepository(prisma, {
      model: 'permission',
      tenantScoped: false,
      hasDeletedAt: true,
      hasStatus: false,
      searchableFields: ['slug'],
      filterableFields: [],
      defaultSortField: 'slug'
    });

    const listed = await repository.list(null, listQuery({ status: 'active' }));
    expect(listed.data).toHaveLength(1);
  });
});

describe('CrudService', () => {
  function buildService() {
    const { repository } = buildRepository();
    return new CrudService(repository, 'Product');
  }

  it('lists through the repository', async () => {
    const service = buildService();
    const result = await service.list(TENANT_A, listQuery());
    expect(result.meta.total).toBe(2);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService();
    await expect(service.get(TENANT_A, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the entity when found', async () => {
    const service = buildService();
    await expect(service.get(TENANT_A, 'p1')).resolves.toMatchObject({ id: 'p1' });
  });

  it('creates, updates and removes', async () => {
    const service = buildService();
    const actor = { id: 'u1', type: 'user' as const };

    const created: any = await service.create(TENANT_A, { sku: 'X', name: 'X' }, actor);
    expect(created.id).toBeTruthy();

    const updated: any = await service.update(TENANT_A, 'p1', { name: 'Updated' }, actor);
    expect(updated.name).toBe('Updated');

    const removed: any = await service.remove(TENANT_A, 'p2', actor);
    expect(removed.deletedAt).toBeInstanceOf(Date);
  });

  it('refuses to update a missing entity', async () => {
    const service = buildService();
    await expect(
      service.update(TENANT_A, 'missing', { name: 'x' }, { id: null, type: 'system' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('createCrudController', () => {
  function buildController() {
    const service = {
      list: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      get: jest.fn().mockResolvedValue({ id: 'p1' }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'p1', name: 'updated' }),
      remove: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: 'x' })
    };
    return { service, controller: createCrudController(service as any) };
  }

  it('lists with the resolved tenant and parsed query', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ query: { page: '2', limit: '5' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.list, req, res);

    expect(service.list).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ page: 2, limit: 5 }));
    expect(res.body.data).toEqual([{ id: 'p1' }]);
  });

  it('gets by id', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ params: { id: 'p1' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.get, req, res);
    expect(service.get).toHaveBeenCalledWith(TENANT_A, 'p1');
  });

  it('creates with the actor context and returns 201', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ body: { name: 'New' } });
    req.tenantId = TENANT_A;
    req.user = { id: 'u1' };
    const res = mockResponse();

    await runHandler(controller.create, req, res);

    expect(service.create).toHaveBeenCalledWith(TENANT_A, { name: 'New' }, { id: 'u1', type: 'user' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updates and removes', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ params: { id: 'p1' }, body: { name: 'Updated' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.update, req, res);
    expect(service.update).toHaveBeenCalled();

    await runHandler(controller.remove, req, mockResponse());
    expect(service.remove).toHaveBeenCalled();
  });

  it('rejects a request without a tenant context', async () => {
    const { controller } = buildController();
    const req = mockRequest();
    req.tenantId = null;

    const error = await runHandler(controller.list, req, mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe('controller helpers', () => {
  it('requireTenant returns the resolved tenant', () => {
    const req: any = { tenantId: 'tenant-1' };
    expect(requireTenant(req)).toBe('tenant-1');
  });

  it('requireTenant throws without a context', () => {
    expect(() => requireTenant({ tenantId: null } as any)).toThrow(UnauthorizedError);
  });

  it('requireActor prefers user, then api key, then system', () => {
    expect(requireActor({ user: { id: 'u1' } } as any)).toEqual({ id: 'u1', type: 'user' });
    expect(requireActor({ apiKey: { id: 'k1' } } as any)).toEqual({ id: 'k1', type: 'api_key' });
    expect(requireActor({ actor: { id: 'x', type: 'user' } } as any)).toEqual({ id: 'x', type: 'user' });
    expect(requireActor({} as any)).toEqual({ id: null, type: 'system' });
  });
});

describe('CRUD routers', () => {
  function controller() {
    return {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    };
  }

  function stackOf(router: any, path: string, method: string): number {
    const layer = router.stack.find((item: any) => item.route?.path === path && item.route?.methods[method]);
    return layer ? layer.route.stack.length : 0;
  }

  it('registers the five CRUD routes with guards and permissions', () => {
    const guard = jest.fn();
    const router = createCrudRouter({
      controller: controller(),
      guards: [guard],
      permissions: { read: 'products:read', create: 'products:create' },
      createValidators: [jest.fn()],
      updateValidators: [jest.fn()]
    });

    expect(stackOf(router, '/', 'get')).toBe(3); // guard + permission + handler
    expect(stackOf(router, '/', 'post')).toBe(4); // guard + permission + validator + handler
    expect(stackOf(router, '/:id', 'delete')).toBe(2); // guard + handler (no delete permission)
  });

  it('registers read-only routes without write verbs', () => {
    const router = createReadOnlyRouter({
      controller: controller(),
      guards: [jest.fn()],
      readPermission: 'currencies:read'
    });

    expect(stackOf(router, '/', 'get')).toBe(3);
    expect(stackOf(router, '/', 'post')).toBe(0);
    expect(stackOf(router, '/:id', 'get')).toBe(3);
    expect(stackOf(router, '/:id', 'patch')).toBe(0);
  });
});
