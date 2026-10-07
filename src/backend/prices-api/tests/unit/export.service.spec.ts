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

describe('ExportService', () => {
  it('queues an export only after catalog access validation', async () => {
    const prisma = createFakePrisma({ exportRequest: [] });
    const catalog = { assertExportInput: jest.fn().mockResolvedValue(undefined), list: jest.fn() };
    const storage = { put: jest.fn(), read: jest.fn(), remove: jest.fn() };
    const service = new ExportService(prisma, catalog as any, storage as any);

    const job = await service.request(
      TENANT,
      USER,
      { priceListId: 'list-1', marketplaceId: 'marketplace-1', format: 'csv', search: 'coffee' },
      { id: USER.id, type: 'user' }
    );

    expect(catalog.assertExportInput).toHaveBeenCalledWith(TENANT, USER, 'list-1', 'marketplace-1');
    expect(job.status).toBe('queued');
    expect(job.filters).toEqual({ search: 'coffee' });
    expect(job.createdBy).toBe(USER.id);
    expect(job.createdByType).toBe('user');
    expect(job.updatedBy).toBeUndefined();
    expect(job.updatedByType).toBeUndefined();
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
    const catalog = {
      assertExportInput: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({
        data: [{ product: { sku: 'SKU-1', name: 'Coffee' }, basePrice: 100, finalPrice: 90 }],
        meta: { totalPages: 1 }
      })
    };
    const storage = {
      put: jest.fn().mockResolvedValue({ storageKey: 'tenant-1/export-1.json', byteSize: 20, checksum: 'checksum' }),
      read: jest.fn().mockResolvedValue(Buffer.from('{"data":[]}')),
      remove: jest.fn()
    };
    const service = new ExportService(prisma, catalog as any, storage as any);

    await expect(service.processPending('worker-1')).resolves.toBe(true);

    const stored = prisma.__store.exportRequest[0];
    expect(stored.status).toBe('completed');
    expect(storage.put).toHaveBeenCalled();

    const downloaded = await service.download(TENANT, USER, 'export-1');
    expect(downloaded.content.toString()).toBe('{"data":[]}');
    expect(catalog.assertExportInput).toHaveBeenCalledWith(TENANT, USER, 'list-1', 'marketplace-1');
  });
});
