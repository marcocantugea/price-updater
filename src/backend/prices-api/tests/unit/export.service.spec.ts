import { ExportService } from '../../src/services/export.service';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = 'tenant-1';
const USER = {
  id: 'user-1',
  email: 'viewer@example.com',
  name: 'Viewer',
  roleId: 'role-viewer',
  roleSlug: 'price_catalog_viewer',
  tenantId: TENANT,
  isGlobalAdmin: false,
  permissions: ['price-catalog:read', 'price-catalog:export']
} as any;

/**
 * A global administrator: no home company, so it can only ever export a company
 * selected in the header (`X-Tenant-Id`).
 */
const GLOBAL_ADMIN = {
  id: 'admin-1',
  email: 'global.admin@example.com',
  name: 'Global Administrator',
  roleId: 'role-admin',
  roleSlug: 'global_admin',
  tenantId: null,
  isGlobalAdmin: true,
  permissions: ['price-catalog:read-all', 'price-catalog:export']
} as any;

/** Catalog double whose `canReadAll` mirrors the real service contract. */
function catalogDouble(overrides: Record<string, any> = {}): any {
  return {
    assertExportInput: jest.fn().mockResolvedValue(undefined),
    canReadAll: jest.fn().mockResolvedValue(false),
    list: jest.fn(),
    ...overrides
  };
}

function storageDouble(): any {
  return { put: jest.fn(), read: jest.fn(), remove: jest.fn() };
}

describe('ExportService', () => {
  it('queues an export only after catalog access validation', async () => {
    const prisma = createFakePrisma({ exportRequest: [] });
    const catalog = catalogDouble();
    const storage = storageDouble();
    const service = new ExportService(prisma, catalog, storage);

    const job = await service.request(
      TENANT,
      USER,
      { priceListId: 'list-1', marketplaceId: 'marketplace-1', format: 'csv', search: 'coffee' },
      { id: USER.id, type: 'user' }
    );

    expect(catalog.assertExportInput).toHaveBeenCalledWith(TENANT, USER, 'list-1', 'marketplace-1');
    expect(job.status).toBe('queued');
    expect(job.filters).toEqual({ search: 'coffee' });
    expect(job.requestedByUserId).toBe(USER.id);
    expect(job.createdBy).toBe(USER.id);
    expect(job.createdByType).toBe('user');
    expect(job.updatedBy).toBeUndefined();
    expect(job.updatedByType).toBeUndefined();
  });

  /**
   * Regression: a global administrator has `users.tenant_id = NULL`, so the
   * composite foreign key `(tenant_id, requested_by_user_id) -> users` cannot
   * hold their id. Storing it aborted the insert with Prisma P2003 and the API
   * answered 500 for every export requested from a global-admin session.
   */
  it('queues an export for a requester who does not belong to the company, as the company itself', async () => {
    const prisma = createFakePrisma({ exportRequest: [] });
    const catalog = catalogDouble({ canReadAll: jest.fn().mockResolvedValue(true) });
    const service = new ExportService(prisma, catalog, storageDouble());

    const job = await service.request(
      TENANT,
      GLOBAL_ADMIN,
      { priceListId: 'list-1', marketplaceId: 'marketplace-1', format: 'csv' },
      { id: GLOBAL_ADMIN.id, type: 'user' }
    );

    // The tenant-owned row: no user reference, audited as the system.
    expect(job.tenantId).toBe(TENANT);
    expect(job.requestedByUserId).toBeNull();
    expect(job.createdBy).toBeNull();
    expect(job.createdByType).toBe('system');
    expect(job.status).toBe('queued');
  });

  it('keeps a tenant administrator of the same company as the requester', async () => {
    const prisma = createFakePrisma({ exportRequest: [] });
    const catalog = catalogDouble();
    const service = new ExportService(prisma, catalog, storageDouble());

    const job = await service.request(
      TENANT,
      { ...USER, roleSlug: 'tenant_admin', permissions: ['price-catalog:export'] },
      { priceListId: 'list-1', marketplaceId: 'marketplace-1', format: 'json' },
      { id: USER.id, type: 'user' }
    );

    expect(job.requestedByUserId).toBe(USER.id);
    expect(job.createdByType).toBe('user');
  });

  it('lists the company-owned exports next to the user ones for a company-wide reader', async () => {
    const prisma = createFakePrisma({
      exportRequest: [
        { id: 'own', tenantId: TENANT, requestedByUserId: GLOBAL_ADMIN.id, status: 'completed' },
        { id: 'company', tenantId: TENANT, requestedByUserId: null, status: 'completed' },
        { id: 'other-user', tenantId: TENANT, requestedByUserId: 'user-2', status: 'completed' },
        { id: 'other-tenant', tenantId: 'tenant-2', requestedByUserId: null, status: 'completed' }
      ]
    });
    const catalog = catalogDouble({ canReadAll: jest.fn().mockResolvedValue(true) });
    const service = new ExportService(prisma, catalog, storageDouble());

    const jobs = await service.list(TENANT, GLOBAL_ADMIN);

    // Own files plus the company-owned ones — still not another user's private
    // export, and never another company's.
    expect(jobs.map((job: any) => job.id).sort()).toEqual(['company', 'own']);
    // A global admin must be able to download what it queued: `get` shares the filter.
    await expect(service.get(TENANT, GLOBAL_ADMIN, 'company')).resolves.toMatchObject({ id: 'company' });
  });

  it('does not leak another user\'s exports to a viewer of the same company', async () => {
    const prisma = createFakePrisma({
      exportRequest: [
        { id: 'own', tenantId: TENANT, requestedByUserId: USER.id, status: 'completed' },
        { id: 'company', tenantId: TENANT, requestedByUserId: null, status: 'completed' },
        { id: 'other-user', tenantId: TENANT, requestedByUserId: 'user-2', status: 'completed' }
      ]
    });
    const catalog = catalogDouble();
    const service = new ExportService(prisma, catalog, storageDouble());

    const jobs = await service.list(TENANT, USER);

    expect(jobs.map((job: any) => job.id)).toEqual(['own']);
    await expect(service.get(TENANT, USER, 'other-user')).rejects.toThrow(/not found/i);
  });

  it('processes a queued export and revalidates access before download', async () => {
    const prisma = createFakePrisma({
      exportRequest: [{
        id: 'export-1',
        tenantId: TENANT,
        requestedByUserId: USER.id,
        priceListId: 'list-1',
        marketplaceId: 'marketplace-1',
        format: 'json',
        filters: null,
        status: 'queued',
        attemptCount: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date('2026-09-19T00:00:00.000Z')
      }]
    });
    const catalog = catalogDouble({
      list: jest.fn().mockResolvedValue({
        data: [{ product: { sku: 'SKU-1', name: 'Coffee' }, basePrice: 100, finalPrice: 90 }],
        meta: { totalPages: 1 }
      })
    });
    const storage = {
      put: jest.fn().mockResolvedValue({ storageKey: 'tenant-1/export-1.json', byteSize: 20, checksum: 'checksum' }),
      read: jest.fn().mockResolvedValue(Buffer.from('{"data":[]}')),
      remove: jest.fn()
    };
    const service = new ExportService(prisma, catalog, storage as any);

    await expect(service.processPending('worker-1')).resolves.toBe(true);

    const stored = prisma.__store.exportRequest[0];
    expect(stored.status).toBe('completed');
    expect(storage.put).toHaveBeenCalled();

    const downloaded = await service.download(TENANT, USER, 'export-1');
    expect(downloaded.content.toString()).toBe('{"data":[]}');
    expect(catalog.assertExportInput).toHaveBeenCalledWith(TENANT, USER, 'list-1', 'marketplace-1');
  });

  /**
   * Regression: the worker used to build its synthetic user from
   * `job.requestedByUserId` directly. With the nullable column that value is
   * `null`, and it must not break the processing loop.
   */
  it('processes a queued export whose requester is the company itself', async () => {
    const prisma = createFakePrisma({
      exportRequest: [{
        id: 'export-2',
        tenantId: TENANT,
        requestedByUserId: null,
        priceListId: 'list-1',
        marketplaceId: 'marketplace-1',
        format: 'csv',
        filters: null,
        status: 'queued',
        attemptCount: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date('2026-09-19T00:00:00.000Z')
      }]
    });
    const catalog = catalogDouble({
      canReadAll: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue({ data: [], meta: { totalPages: 0 } })
    });
    const storage = {
      put: jest.fn().mockResolvedValue({ storageKey: 'tenant-1/export-2.csv', byteSize: 10, checksum: 'checksum' }),
      read: jest.fn(),
      remove: jest.fn()
    };
    const service = new ExportService(prisma, catalog, storage as any);

    await expect(service.processPending('worker-1')).resolves.toBe(true);

    expect(prisma.__store.exportRequest[0].status).toBe('completed');
    // The worker reads the catalog under its own authority, never as the requester.
    const [, workerUser] = catalog.list.mock.calls[0];
    expect(workerUser).toMatchObject({ tenantId: TENANT, isGlobalAdmin: true });
    expect(workerUser.permissions).toContain('price-catalog:read-all');
  });
});
