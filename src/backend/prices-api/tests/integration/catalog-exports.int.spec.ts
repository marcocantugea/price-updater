import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../src/common/errors';
import { ExportService } from '../../src/services/export.service';
import type { AuthUser } from '../../src/types';
import { closeTestPrisma, createIsolatedTenant, testPrisma } from './helpers/test-database';

/**
 * Integration suite the unit double cannot replace: the composite foreign key
 * `(tenant_id, requested_by_user_id) -> users(tenant_id, id)` as MySQL enforces
 * it, and the visibility filter that reads those rows back.
 *
 * Background. A global administrator has `users.tenant_id = NULL` and exports the
 * company selected in the `X-Tenant-Id` header. Storing their id next to the
 * selected tenant violated the composite key (Prisma P2003) and every export
 * requested from a global-admin session answered 500. The migration
 * `20261010000100_allow_global_admin_export_requests` makes the column nullable:
 * the pair is either a real member of the company or NULL.
 *
 * The suite pins both halves of that contract:
 *
 * - NULL is accepted (the fix);
 * - a requester from *another* company is still rejected (the guarantee the
 *   column existed for in the first place).
 */

const ACTOR = { id: null, type: 'system' as const };

/** Catalog stub: this suite is about the export row, not about the price engine. */
function catalogStub(canReadAll: boolean): any {
  return {
    assertExportInput: jest.fn().mockResolvedValue(undefined),
    canReadAll: jest.fn().mockResolvedValue(canReadAll),
    list: jest.fn()
  };
}

function storageStub(): any {
  return { put: jest.fn(), read: jest.fn(), remove: jest.fn() };
}

function authUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: randomUUID(),
    email: 'user@example.com',
    name: 'User',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: null,
    isGlobalAdmin: false,
    permissions: ['price-catalog:export'],
    preferredLocale: 'es-419',
    ...overrides
  };
}

describe('price catalog exports against MySQL', () => {
  const prisma = testPrisma();
  let tenantId: string;
  let otherTenantId: string;
  let priceListId: string;
  let marketplaceId: string;
  /** Roles are a global catalog, seeded by `npm run test:integration`. */
  let roleId: string;

  beforeEach(async () => {
    tenantId = await createIsolatedTenant(prisma, 'exports');
    otherTenantId = await createIsolatedTenant(prisma, 'exports-other');
    roleId = (await prisma.role.findFirstOrThrow({ where: { slug: 'tenant_admin' } })).id;

    const list = await prisma.priceList.create({
      data: { tenantId, name: `Marketplace ${randomUUID().slice(0, 8)}`, createdByType: 'system', updatedByType: 'system' }
    });
    priceListId = list.id;

    const marketplace = await prisma.marketplace.create({
      data: {
        tenantId,
        name: `Amazon ${randomUUID().slice(0, 8)}`,
        code: 'amazon',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });
    marketplaceId = marketplace.id;

    await prisma.priceListMarketplace.create({ data: { tenantId, priceListId, marketplaceId } });
  });

  afterEach(async () => {
    await prisma.exportRequest.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.marketplace.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.priceList.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  });

  afterAll(async () => {
    await closeTestPrisma();
  });

  /**
   * A company member: the pair (tenantId, userId) exists in `users`.
   *
   * The role decides whether the member also reads the whole company catalog
   * (`price_catalog_viewer` does not; `tenant_admin` does), which is exactly what
   * gates company-owned exports.
   */
  async function createTenantUser(roleSlug = 'tenant_admin'): Promise<string> {
    const role = await prisma.role.findFirstOrThrow({ where: { slug: roleSlug } });
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: `Member ${roleSlug}`,
        email: `member-${randomUUID()}@example.com`,
        // 60 characters, the length bcrypt produces. Never verified here.
        passwordHash: randomUUID().replace(/-/g, '').padEnd(60, 'x').slice(0, 60),
        roleId: role.id
      }
    });

    return user.id;
  }

  it('allows a null requester: the composite key no longer rejects the global-admin export', async () => {
    const globalAdmin = authUser({ id: randomUUID(), tenantId: null, isGlobalAdmin: true, roleSlug: 'global_admin' });
    const service = new ExportService(prisma, catalogStub(true), storageStub());

    const job = await service.request(
      tenantId,
      globalAdmin,
      { priceListId, marketplaceId, format: 'csv' },
      { id: globalAdmin.id, type: 'user' }
    );

    const stored = await prisma.exportRequest.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.tenantId).toBe(tenantId);
    expect(stored.requestedByUserId).toBeNull();
    // Audited as the company, since the requester is not a member of it.
    expect(stored.createdBy).toBeNull();
    expect(stored.createdByType).toBe('system');
    expect(stored.status).toBe('queued');
  });

  it('still rejects a requester who belongs to another company', async () => {
    const strangerId = randomUUID();
    await prisma.user.create({
      data: {
        tenantId: otherTenantId,
        name: 'Other Company Admin',
        email: `stranger-${randomUUID()}@example.com`,
        passwordHash: randomUUID().replace(/-/g, '').padEnd(60, 'x').slice(0, 60),
        roleId
      }
    });

    // The column is nullable, not unconstrained: a cross-company id must fail
    // exactly as it did before the migration.
    await expect(
      prisma.exportRequest.create({
        data: {
          id: randomUUID(),
          tenantId,
          requestedByUserId: strangerId,
          priceListId,
          marketplaceId,
          format: 'csv',
          status: 'queued'
        }
      })
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('keeps a company member as the requester', async () => {
    const userId = await createTenantUser();
    const member = authUser({ id: userId, tenantId });
    const service = new ExportService(prisma, catalogStub(false), storageStub());

    const job = await service.request(
      tenantId,
      member,
      { priceListId, marketplaceId, format: 'json' },
      { id: userId, type: 'user' }
    );

    const stored = await prisma.exportRequest.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.requestedByUserId).toBe(userId);
    expect(stored.createdBy).toBe(userId);
    expect(stored.createdByType).toBe('user');
  });

  it('shows company-owned exports only to a company-wide reader, never to a plain member', async () => {
    const viewerId = await createTenantUser('price_catalog_viewer');
    const globalAdmin = authUser({ id: randomUUID(), tenantId: null, isGlobalAdmin: true, roleSlug: 'global_admin' });

    const companyOwned = await prisma.exportRequest.create({
      data: {
        id: randomUUID(),
        tenantId,
        requestedByUserId: null,
        priceListId,
        marketplaceId,
        format: 'csv',
        status: 'completed',
        createdByType: 'system'
      }
    });

    const reader = new ExportService(prisma, catalogStub(true), storageStub());
    const memberService = new ExportService(prisma, catalogStub(false), storageStub());

    // The global admin sees the file it queued and can download it...
    await expect(reader.get(tenantId, globalAdmin, companyOwned.id)).resolves.toMatchObject({
      id: companyOwned.id
    });

    // ...while a member without company-wide read access (the viewer role holds
    // `price-catalog:read` and `price-catalog:export`, but not `read-all`) cannot
    // even learn that it exists.
    const viewer = authUser({ id: viewerId, tenantId, roleSlug: 'price_catalog_viewer' });
    await expect(memberService.get(tenantId, viewer, companyOwned.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await memberService.list(tenantId, viewer)).map((row: any) => row.id)).not.toContain(companyOwned.id);
  });

  it('never exposes another company\'s export', async () => {
    const globalAdmin = authUser({ id: randomUUID(), tenantId: null, isGlobalAdmin: true, roleSlug: 'global_admin' });
    const otherTenantList = await prisma.priceList.create({
      data: { tenantId: otherTenantId, name: `Other ${randomUUID().slice(0, 8)}` }
    });
    const otherMarketplace = await prisma.marketplace.create({
      data: { tenantId: otherTenantId, name: `Other ${randomUUID().slice(0, 8)}`, code: 'own_store' }
    });
    const foreign = await prisma.exportRequest.create({
      data: {
        id: randomUUID(),
        tenantId: otherTenantId,
        requestedByUserId: null,
        priceListId: otherTenantList.id,
        marketplaceId: otherMarketplace.id,
        format: 'csv',
        status: 'completed'
      }
    });

    const service = new ExportService(prisma, catalogStub(true), storageStub());

    await expect(service.get(tenantId, globalAdmin, foreign.id)).rejects.toThrow(/not found/i);
    expect((await service.list(tenantId, globalAdmin)).map((row: any) => row.id)).not.toContain(foreign.id);
  });
});
