import { TenantCrudRepository } from '../../src/common/crud/repository';
import { RoleRepository } from '../../src/repositories/role.repository';
import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import { TenantService } from '../../src/services/tenant.service';
import { UserService } from '../../src/services/user.service';
import { RoleService } from '../../src/services/role.service';
import { ApiKeyService } from '../../src/services/api-key.service';
import { PriceService } from '../../src/services/price.service';
import { PriceListService } from '../../src/services/price-list.service';
import { PriceListAccessService } from '../../src/services/price-list-access.service';
import { PriceCatalogService } from '../../src/services/price-catalog.service';
import { DiscountService } from '../../src/services/discount.service';
import { DashboardService } from '../../src/services/dashboard.service';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/common/errors';
import { hashApiKey } from '../../src/common/utils/api-key';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const ACTOR = { id: 'user-1', type: 'user' as const };

function repositories(prisma: any) {
  return {
    tenant: new TenantCrudRepository(prisma, MODEL_OPTIONS.tenant),
    user: new TenantCrudRepository(prisma, MODEL_OPTIONS.user),
    role: new RoleRepository(prisma, MODEL_OPTIONS.role),
    permission: new TenantCrudRepository(prisma, MODEL_OPTIONS.permission),
    apiKey: new TenantCrudRepository(prisma, MODEL_OPTIONS.apiKey),
    product: new TenantCrudRepository(prisma, MODEL_OPTIONS.product),
    marketplace: new TenantCrudRepository(prisma, MODEL_OPTIONS.marketplace),
    priceList: new TenantCrudRepository(prisma, MODEL_OPTIONS.priceList),
    price: new TenantCrudRepository(prisma, MODEL_OPTIONS.price),
    discount: new TenantCrudRepository(prisma, MODEL_OPTIONS.discount),
    currency: new TenantCrudRepository(prisma, MODEL_OPTIONS.currency),
    priceHistory: new TenantCrudRepository(prisma, MODEL_OPTIONS.priceHistory)
  };
}

const query = (overrides: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  order: 'desc' as const,
  ...overrides
});

// ---------------------------------------------------------------------------
// Companies / tenants
// ---------------------------------------------------------------------------

describe('TenantService', () => {
  function build() {
    const prisma = createFakePrisma({
      currency: [
        { id: 'c1', code: 'MXN', name: 'Peso', symbol: '$', decimals: 2, status: 'active', deletedAt: null },
        { id: 'c2', code: 'USD', name: 'Dollar', symbol: '$', decimals: 2, status: 'active', deletedAt: null }
      ],
      tenant: [
        {
          id: 't1',
          commercialName: 'Acme',
          legalName: 'Acme SA',
          slug: 'acme',
          status: 'active',
          defaultCurrency: 'MXN',
          timeZone: 'UTC',
          deletedAt: null
        }
      ]
    });
    return new TenantService(repositories(prisma).tenant, repositories(prisma).currency);
  }

  it('lists companies (not tenant scoped)', async () => {
    const service = build();
    const result = await service.list(null, query());
    expect(result.meta.total).toBe(1);
  });

  it('creates a company when the currency exists', async () => {
    const service = build();
    const created: any = await service.create(
      null,
      { commercialName: 'New', legalName: 'New SA', slug: 'new-co', defaultCurrency: 'USD' },
      ACTOR
    );
    expect(created.slug).toBe('new-co');
  });

  it('rejects an unknown default currency', async () => {
    const service = build();
    await expect(
      service.create(null, { commercialName: 'X', legalName: 'X', slug: 'x-co', defaultCurrency: 'EUR' }, ACTOR)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown currency on update', async () => {
    const service = build();
    await expect(service.update(null, 't1', { defaultCurrency: 'EUR' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('returns the current company', async () => {
    const service = build();
    await expect(service.current('t1')).resolves.toMatchObject({ id: 't1' });
  });

  it('updates the current company time zone with audit context', async () => {
    const service = build();

    const updated: any = await service.updateTimeZone('t1', 'America/Mexico_City', ACTOR);

    expect(updated).toMatchObject({ id: 't1', timeZone: 'America/Mexico_City' });
  });

  it('rejects an invalid company time zone', async () => {
    const service = build();

    await expect(service.updateTimeZone('t1', 'Invalid/Zone', ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('UserService', () => {
  function build() {
    const prisma = createFakePrisma({
      role: [
        { id: 'role-system', tenantId: null, slug: 'tenant_admin', name: 'Admin', isSystem: true, status: 'active', deletedAt: null },
        { id: 'role-other', tenantId: OTHER_TENANT, slug: 'custom', name: 'Other', isSystem: false, status: 'active', deletedAt: null }
      ],
      user: [
        {
          id: 'u1',
          tenantId: TENANT,
          name: 'Existing',
          email: 'existing@example.com',
          passwordHash: 'stored-hash',
          roleId: 'role-system',
          status: 'active',
          deletedAt: null
        }
      ]
    });
    const repos = repositories(prisma);
    return { prisma, service: new UserService(repos.user, repos.role), repos };
  }

  it('creates a user hashing the password and never returning it', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(
      TENANT,
      { name: 'New', email: 'NEW@Example.com', password: 'Password!123', roleId: 'role-system' },
      ACTOR
    );

    expect(created.email).toBe('new@example.com');
    expect(created.passwordHash).toBeUndefined();

    const stored = prisma.__store.user.find((row: any) => row.id === created.id);
    expect(stored.passwordHash).not.toBe('Password!123');
    expect(stored.passwordHash.length).toBeGreaterThan(20);
    expect(stored.tenantId).toBe(TENANT);
  });

  it('rejects a duplicate email', async () => {
    const { service } = build();
    await expect(
      service.create(TENANT, { name: 'Dup', email: 'existing@example.com', password: 'Password!123', roleId: 'role-system' }, ACTOR)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a role from another company', async () => {
    const { service } = build();
    await expect(
      service.create(TENANT, { name: 'X', email: 'x@example.com', password: 'Password!123', roleId: 'role-other' }, ACTOR)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('strips passwordHash from listings and reads', async () => {
    const { service } = build();
    const listed = await service.list(TENANT, query());
    expect(listed.data[0].passwordHash).toBeUndefined();

    const single = await service.get(TENANT, 'u1');
    expect(single.passwordHash).toBeUndefined();
  });

  it('re-hashes the password on update', async () => {
    const { service, prisma } = build();
    await service.update(TENANT, 'u1', { password: 'BrandNew!123' }, ACTOR);

    const stored = prisma.__store.user.find((row: any) => row.id === 'u1');
    expect(stored.passwordHash).not.toBe('stored-hash');
    expect(stored.passwordHash).not.toBe('BrandNew!123');
  });

  it('rejects an email taken by another user', async () => {
    const { service } = build();
    await service.create(TENANT, { name: 'B', email: 'b@example.com', password: 'Password!123', roleId: 'role-system' }, ACTOR);

    await expect(service.update(TENANT, 'u1', { email: 'b@example.com' }, ACTOR)).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('allows keeping the same email on update', async () => {
    const { service } = build();
    await expect(service.update(TENANT, 'u1', { email: 'existing@example.com' }, ACTOR)).resolves.toBeTruthy();
  });

  it('rejects updates with no effective changes', async () => {
    const { service } = build();
    await expect(service.update(TENANT, 'u1', {}, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('validates the new role on update', async () => {
    const { service } = build();
    await expect(service.update(TENANT, 'u1', { roleId: 'role-other' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('defaults the locale to es-419 when the create payload omits it', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(
      TENANT,
      { name: 'New', email: 'new@example.com', password: 'Password!123', roleId: 'role-system' },
      ACTOR
    );

    expect(created.preferredLocale).toBe('es-419');
    expect(prisma.__store.user.find((row: any) => row.id === created.id).preferredLocale).toBe('es-419');
  });

  it('persists both supported locales on administrative create', async () => {
    const { service, prisma } = build();

    for (const locale of ['es-419', 'en-US']) {
      const created: any = await service.create(
        TENANT,
        {
          name: `User ${locale}`,
          email: `${locale}@example.com`,
          password: 'Password!123',
          roleId: 'role-system',
          preferredLocale: locale
        },
        ACTOR
      );

      expect(created.preferredLocale).toBe(locale);
      expect(prisma.__store.user.find((row: any) => row.id === created.id).preferredLocale).toBe(locale);
    }
  });

  it('rejects an unsupported locale instead of silently coercing it', async () => {
    const { service, prisma } = build();
    const before = prisma.__store.user.length;

    await expect(
      service.create(
        TENANT,
        {
          name: 'Bad',
          email: 'bad@example.com',
          password: 'Password!123',
          roleId: 'role-system',
          preferredLocale: 'es-MX'
        },
        ACTOR
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(service.update(TENANT, 'u1', { preferredLocale: 'fr-FR' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
    // Nothing was written.
    expect(prisma.__store.user).toHaveLength(before);
    expect(prisma.__store.user.find((row: any) => row.id === 'u1').preferredLocale).toBeUndefined();
  });

  it('accepts a UI locale on update and keeps it isolated from other fields', async () => {
    const { service, prisma } = build();

    const updated: any = await service.update(TENANT, 'u1', { preferredLocale: 'en-US' }, ACTOR);

    expect(updated.preferredLocale).toBe('en-US');
    expect(prisma.__store.user.find((row: any) => row.id === 'u1').preferredLocale).toBe('en-US');
    // An unrelated update preserves the stored preference.
    expect(prisma.__store.user.find((row: any) => row.id === 'u1').email).toBe('existing@example.com');
  });

  it('leaves the stored locale untouched on an unrelated update', async () => {
    const { service, prisma } = build();
    prisma.__store.user.find((row: any) => row.id === 'u1').preferredLocale = 'en-US';

    await service.update(TENANT, 'u1', { name: 'Renamed' }, ACTOR);

    expect(prisma.__store.user.find((row: any) => row.id === 'u1').preferredLocale).toBe('en-US');
  });

  it('keeps the password hash out of the response after a locale change', async () => {
    const { service } = build();
    const updated: any = await service.update(TENANT, 'u1', { preferredLocale: 'en-US' }, ACTOR);

    expect(updated.passwordHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Roles (global + per tenant)
// ---------------------------------------------------------------------------

describe('RoleService', () => {
  function build() {
    const prisma = createFakePrisma({
      permission: [
        { id: 'perm-1', slug: 'products:read', name: 'Read products', deletedAt: null },
        { id: 'perm-2', slug: 'products:create', name: 'Create products', deletedAt: null }
      ],
      role: [
        { id: 'role-global', tenantId: null, slug: 'global_admin', name: 'Global', isSystem: true, status: 'active', deletedAt: null },
        { id: 'role-tenant', tenantId: TENANT, slug: 'custom_role', name: 'Custom', isSystem: false, status: 'active', deletedAt: null },
        { id: 'role-other', tenantId: OTHER_TENANT, slug: 'other_role', name: 'Other', isSystem: false, status: 'active', deletedAt: null }
      ],
      rolePermission: [{ roleId: 'role-tenant', permissionId: 'perm-1' }]
    });
    const repos = repositories(prisma);
    return { prisma, service: new RoleService(repos.role, repos.permission, prisma) };
  }

  it('lists system roles plus the tenant roles, excluding other tenants', async () => {
    const { service } = build();
    const result = await service.list(TENANT, query({ sort: 'slug', order: 'asc' }));

    expect(result.data.map((row: any) => row.slug)).toEqual(['custom_role', 'global_admin']);
  });

  it('creates a custom role owned by the tenant with permissions', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(
      TENANT,
      { name: 'New role', slug: 'new_role', permissionSlugs: ['products:read', 'products:create'] },
      ACTOR
    );

    expect(created.tenantId).toBe(TENANT);
    expect(created.isSystem).toBe(false);
    expect(prisma.__store.rolePermission.filter((row: any) => row.roleId === created.id)).toHaveLength(2);
  });

  it('rejects a duplicate slug', async () => {
    const { service } = build();
    await expect(
      service.create(TENANT, { name: 'Dup', slug: 'global_admin' }, ACTOR)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects unknown permissions', async () => {
    const { service } = build();
    await expect(
      service.create(TENANT, { name: 'X', slug: 'x_role', permissionSlugs: ['nope:nope'] }, ACTOR)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to change a system role slug', async () => {
    const { service } = build();
    await expect(
      service.update(TENANT, 'role-global', { slug: 'renamed' }, ACTOR)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to delete a system role', async () => {
    const { service } = build();
    await expect(service.remove(TENANT, 'role-global', ACTOR)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('soft deletes a custom role', async () => {
    const { service } = build();
    const removed: any = await service.remove(TENANT, 'role-tenant', ACTOR);
    expect(removed.deletedAt).toBeInstanceOf(Date);
  });

  it('returns the permission slugs of a role', async () => {
    const { service } = build();
    await expect(service.permissions(TENANT, 'role-tenant')).resolves.toEqual(['products:read']);
  });

  it('replaces the assigned permissions', async () => {
    const { service, prisma } = build();
    const result = await service.assignPermissions(TENANT, 'role-tenant', ['products:create'], ACTOR);

    expect(result).toEqual(['products:create']);
    const rows = prisma.__store.rolePermission.filter((row: any) => row.roleId === 'role-tenant');
    expect(rows).toHaveLength(1);
    expect(rows[0].permissionId).toBe('perm-2');
  });

  it('clears permissions when assigning an empty list', async () => {
    const { service, prisma } = build();
    await service.assignPermissions(TENANT, 'role-tenant', [], ACTOR);
    expect(prisma.__store.rolePermission.filter((row: any) => row.roleId === 'role-tenant')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

describe('ApiKeyService', () => {
  function build() {
    const prisma = createFakePrisma({
      apiKey: [
        {
          id: 'key-active',
          tenantId: TENANT,
          name: 'Active key',
          keyHash: hashApiKey('pg_active_secret'),
          prefix: 'pg_active_',
          scopes: ['products:read'],
          status: 'active',
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
          deletedAt: null
        },
        {
          id: 'key-expired',
          tenantId: TENANT,
          name: 'Expired key',
          keyHash: hashApiKey('pg_expired_secret'),
          prefix: 'pg_expired',
          scopes: ['products:read'],
          status: 'active',
          expiresAt: new Date('2000-01-01'),
          revokedAt: null,
          lastUsedAt: null,
          deletedAt: null
        },
        {
          id: 'key-revoked',
          tenantId: TENANT,
          name: 'Revoked key',
          keyHash: hashApiKey('pg_revoked_secret'),
          prefix: 'pg_revoked',
          scopes: ['products:read'],
          status: 'revoked',
          expiresAt: null,
          revokedAt: new Date('2024-01-01'),
          lastUsedAt: null,
          deletedAt: null
        }
      ]
    });
    return { prisma, service: new ApiKeyService(repositories(prisma).apiKey) };
  }

  it('returns the plaintext key once but stores only its hash', async () => {
    const { service, prisma } = build();
    const created = await service.create(TENANT, { name: 'New key', scopes: ['prices:read'] }, ACTOR);

    expect(created.plaintextKey.startsWith('pg_')).toBe(true);

    const stored = prisma.__store.apiKey.find((row: any) => row.id === created.id);
    expect(stored.keyHash).toBe(hashApiKey(created.plaintextKey));
    expect(stored.keyHash).not.toBe(created.plaintextKey);
  });

  it('adds the derived effective status to listings and reads', async () => {
    const { service } = build();
    const listed = await service.list(TENANT, query());
    const byId = new Map(listed.data.map((row: any) => [row.id, row]));

    expect((byId.get('key-active') as any).effectiveStatus).toBe('active');
    expect((byId.get('key-expired') as any).effectiveStatus).toBe('expired');
    expect((byId.get('key-revoked') as any).effectiveStatus).toBe('revoked');
  });

  it('normalizes scopes on update', async () => {
    const { service, prisma } = build();
    const updated: any = await service.update(TENANT, 'key-active', { scopes: ['prices:read'] }, ACTOR);

    expect(updated.scopes).toEqual(['prices:read']);
    expect(prisma.__store.apiKey.find((row: any) => row.id === 'key-active').scopes).toEqual(['prices:read']);
  });

  it('persists revocation', async () => {
    const { service, prisma } = build();
    const revoked: any = await service.revoke(TENANT, 'key-active', ACTOR);

    expect(revoked.status).toBe('revoked');
    expect(revoked.effectiveStatus).toBe('revoked');
    expect(prisma.__store.apiKey.find((row: any) => row.id === 'key-active').revokedAt).toBeInstanceOf(Date);
  });

  it('soft deletes a key', async () => {
    const { service } = build();
    const removed: any = await service.remove(TENANT, 'key-active', ACTOR);
    expect(removed.deletedAt).toBeInstanceOf(Date);
  });

  describe('resolveByRawKey (external authentication)', () => {
    it('resolves the tenant and scopes and stamps last_used_at', async () => {
      const { service, prisma } = build();
      const context = await service.resolveByRawKey('pg_active_secret');

      expect(context).toEqual({ id: 'key-active', tenantId: TENANT, scopes: ['products:read'] });
      expect(prisma.__store.apiKey.find((row: any) => row.id === 'key-active').lastUsedAt).toBeInstanceOf(Date);
    });

    it('rejects an unknown key', async () => {
      const { service } = build();
      await expect(service.resolveByRawKey('pg_unknown')).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
    });

    it('rejects a revoked key', async () => {
      const { service } = build();
      await expect(service.resolveByRawKey('pg_revoked_secret')).rejects.toMatchObject({
        code: 'API_KEY_REVOKED'
      });
    });

    it('rejects an expired key (derived status)', async () => {
      const { service } = build();
      await expect(service.resolveByRawKey('pg_expired_secret')).rejects.toMatchObject({
        code: 'API_KEY_EXPIRED'
      });
    });

    it('never matches a plaintext value against stored hashes', async () => {
      const { service } = build();
      await expect(service.resolveByRawKey(hashApiKey('pg_active_secret'))).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

describe('PriceService', () => {
  function build() {
    const prisma = createFakePrisma({
      currency: [{ id: 'c1', code: 'MXN', name: 'Peso', symbol: '$', decimals: 2, status: 'active', deletedAt: null }],
      product: [
        { id: 'prod-1', tenantId: TENANT, sku: 'SKU-1', name: 'Cafetera', deletedAt: null },
        { id: 'prod-other', tenantId: OTHER_TENANT, sku: 'SKU-X', name: 'Ajena', deletedAt: null }
      ],
      priceList: [
        { id: 'list-1', tenantId: TENANT, name: 'Retail', deletedAt: null },
        { id: 'list-other', tenantId: OTHER_TENANT, name: 'Ajena', deletedAt: null }
      ],
      marketplace: [
        { id: 'mkt-1', tenantId: TENANT, name: 'Amazon', code: 'amazon', deletedAt: null },
        { id: 'mkt-other', tenantId: OTHER_TENANT, name: 'Ajena', code: 'amazon', deletedAt: null }
      ],
      discount: [
        {
          id: 'disc-product',
          tenantId: TENANT,
          name: 'Product 10%',
          type: 'percentage',
          value: 10,
          appliesTo: 'product',
          productId: 'prod-1',
          priceListId: null,
          marketplaceId: null,
          startDate: new Date('2024-01-01'),
          endDate: null,
          priority: 10,
          status: 'active',
          deletedAt: null,
          createdAt: new Date('2024-01-01')
        },
        {
          id: 'disc-list',
          tenantId: TENANT,
          name: 'List 50%',
          type: 'percentage',
          value: 50,
          appliesTo: 'price_list',
          productId: null,
          priceListId: 'list-1',
          marketplaceId: null,
          startDate: new Date('2024-01-01'),
          endDate: null,
          priority: 10,
          status: 'active',
          deletedAt: null,
          createdAt: new Date('2024-01-01')
        }
      ]
    });
    const repos = repositories(prisma);
    const service = new PriceService(
      repos.price,
      repos.discount,
      repos.currency,
      repos.product,
      repos.priceList,
      repos.marketplace,
      prisma
    );
    return { prisma, service };
  }

  const input = {
    productId: 'prod-1',
    priceListId: 'list-1',
    marketplaceId: 'mkt-1',
    basePrice: 100,
    currencyCode: 'MXN'
  };

  it('previews the product discount over the list discount (no stacking)', async () => {
    const { service } = build();
    const preview = await service.preview(TENANT, input);

    expect(preview.scope).toBe('product');
    expect(preview.finalPrice).toBe(90);
  });

  it('rejects an unknown currency', async () => {
    const { service } = build();
    await expect(service.preview(TENANT, { ...input, currencyCode: 'EUR' })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('creates the price with the computed final price and a create history row', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(
      TENANT,
      { ...input, startDate: new Date('2024-01-01') },
      ACTOR
    );

    expect(created.finalPrice).toBe(90);

    const history = prisma.__store.priceHistory.filter((row: any) => row.priceId === created.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ reason: 'create', changedByType: 'user', changedById: 'user-1' });
    expect(Number(history[0].newFinalPrice)).toBe(90);
  });

  it('writes an update history row when the price changes', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(TENANT, { ...input, startDate: new Date('2024-01-01') }, ACTOR);

    await service.update(TENANT, created.id, { basePrice: 200 }, ACTOR);

    const history = prisma.__store.priceHistory.filter((row: any) => row.priceId === created.id);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ reason: 'update' });
    expect(Number(history[1].oldBasePrice)).toBe(100);
    expect(Number(history[1].newBasePrice)).toBe(200);
    expect(Number(history[1].newFinalPrice)).toBe(180);
  });

  it('does not write history when nothing relevant changed', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(TENANT, { ...input, startDate: new Date('2024-01-01') }, ACTOR);

    await service.update(TENANT, created.id, { notes: 'only notes' }, ACTOR);

    const history = prisma.__store.priceHistory.filter((row: any) => row.priceId === created.id);
    expect(history).toHaveLength(1);
  });

  it('records the api_key actor in history', async () => {
    const { service, prisma } = build();
    const created: any = await service.create(TENANT, { ...input, startDate: new Date('2024-01-01') }, {
      id: 'key-1',
      type: 'api_key'
    });

    const history = prisma.__store.priceHistory.find((row: any) => row.priceId === created.id);
    expect(history.changedByType).toBe('api_key');
    expect(history.changedById).toBe('key-1');
  });

  describe('multi-tenant reference validation', () => {
    it('rejects a product owned by another tenant', async () => {
      const { service } = build();
      await expect(
        service.create(TENANT, { ...input, productId: 'prod-other', startDate: new Date() }, ACTOR)
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a price list owned by another tenant', async () => {
      const { service } = build();
      await expect(
        service.create(TENANT, { ...input, priceListId: 'list-other', startDate: new Date() }, ACTOR)
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a marketplace owned by another tenant', async () => {
      const { service } = build();
      await expect(
        service.create(TENANT, { ...input, marketplaceId: 'mkt-other', startDate: new Date() }, ACTOR)
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects cross-tenant references from the calculate preview too', async () => {
      const { service } = build();
      await expect(service.preview(TENANT, { ...input, productId: 'prod-other' })).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('reports the offending field', async () => {
      const { service } = build();
      try {
        await service.preview(TENANT, { ...input, marketplaceId: 'mkt-other' });
        fail('expected a ValidationError');
      } catch (error) {
        expect((error as ValidationError).details?.[0].field).toBe('marketplaceId');
      }
    });

    it('does not persist anything when a reference is rejected', async () => {
      const { service, prisma } = build();
      await expect(
        service.create(TENANT, { ...input, productId: 'prod-other', startDate: new Date() }, ACTOR)
      ).rejects.toBeInstanceOf(ValidationError);

      expect(prisma.__store.price ?? []).toHaveLength(0);
      expect(prisma.__store.priceHistory ?? []).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Discounts (scope references must belong to the tenant)
// ---------------------------------------------------------------------------

describe('DiscountService', () => {
  function build() {
    const prisma = createFakePrisma({
      product: [
        { id: 'prod-1', tenantId: TENANT, sku: 'SKU-1', name: 'Cafetera', deletedAt: null },
        { id: 'prod-other', tenantId: OTHER_TENANT, sku: 'SKU-X', name: 'Ajena', deletedAt: null }
      ],
      priceList: [{ id: 'list-other', tenantId: OTHER_TENANT, name: 'Ajena', deletedAt: null }],
      marketplace: [{ id: 'mkt-other', tenantId: OTHER_TENANT, name: 'Ajena', code: 'amazon', deletedAt: null }],
      discount: []
    });
    const repos = repositories(prisma);
    const service = new DiscountService(repos.discount, repos.product, repos.priceList, repos.marketplace);
    return { prisma, service };
  }

  const baseDiscount = {
    name: 'Verano',
    type: 'percentage' as const,
    value: 10,
    appliesTo: 'product' as const,
    productId: 'prod-1',
    priceListId: null,
    marketplaceId: null,
    startDate: new Date('2024-01-01'),
    endDate: null,
    priority: 10,
    status: 'active',
    description: null
  };

  it('creates a discount whose product belongs to the tenant, with audit columns', async () => {
    const { service } = build();
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    expect(created.tenantId).toBe(TENANT);
    expect(created.createdBy).toBe('user-1');
    expect(created.createdByType).toBe('user');
  });

  it('rejects a duplicate discount name with a domain conflict', async () => {
    const { service } = build();
    await service.create(TENANT, { ...baseDiscount }, ACTOR);

    await expect(service.create(TENANT, { ...baseDiscount }, ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCOUNT_NAME_TAKEN'
    });
  });

  it('allows a record to retain its own name during update', async () => {
    const { service } = build();
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    await expect(service.update(TENANT, created.id, { name: 'Verano' }, ACTOR)).resolves.toMatchObject({
      id: created.id,
      name: 'Verano'
    });
  });

  it('rejects a product-scoped discount pointing at another tenant', async () => {
    const { service } = build();
    await expect(service.create(TENANT, { ...baseDiscount, productId: 'prod-other' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects a price-list scoped discount pointing at another tenant', async () => {
    const { service } = build();
    await expect(
      service.create(
        TENANT,
        { ...baseDiscount, appliesTo: 'price_list', productId: null, priceListId: 'list-other' },
        ACTOR
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a marketplace scoped discount pointing at another tenant', async () => {
    const { service } = build();
    await expect(
      service.create(
        TENANT,
        { ...baseDiscount, appliesTo: 'marketplace', productId: null, marketplaceId: 'mkt-other' },
        ACTOR
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an update that moves the scope to another tenant', async () => {
    const { service } = build();
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    await expect(service.update(TENANT, created.id, { productId: 'prod-other' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('allows updating unrelated fields', async () => {
    const { service } = build();
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    const updated: any = await service.update(TENANT, created.id, { value: 25 }, ACTOR);
    expect(Number(updated.value)).toBe(25);
    expect(updated.priceListId).toBeNull();
    expect(updated.marketplaceId).toBeNull();
  });

  it('rejects a partial update that supplies a reference for another scope', async () => {
    const { service } = build();
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    await expect(service.update(TENANT, created.id, { marketplaceId: 'mkt-other' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('clears the previous reference when changing scope', async () => {
    const { service, prisma } = build();
    prisma.__store.priceList.push({ id: 'list-1', tenantId: TENANT, name: 'Retail', deletedAt: null });
    const created: any = await service.create(TENANT, { ...baseDiscount }, ACTOR);

    const updated: any = await service.update(
      TENANT,
      created.id,
      { appliesTo: 'price_list', priceListId: 'list-1' },
      ACTOR
    );

    expect(updated.appliesTo).toBe('price_list');
    expect(updated.productId).toBeNull();
    expect(updated.priceListId).toBe('list-1');
    expect(updated.marketplaceId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Price lists (relations)
// ---------------------------------------------------------------------------

describe('PriceListService', () => {
  function build() {
    const prisma = createFakePrisma({
      priceList: [{ id: 'list-1', tenantId: TENANT, name: 'Retail', status: 'active', deletedAt: null }],
      product: [
        { id: 'prod-1', tenantId: TENANT, sku: 'A', name: 'A', deletedAt: null },
        { id: 'prod-2', tenantId: TENANT, sku: 'B', name: 'B', deletedAt: null },
        { id: 'prod-other', tenantId: OTHER_TENANT, sku: 'X', name: 'Other', deletedAt: null }
      ],
      marketplace: [
        { id: 'mkt-1', tenantId: TENANT, name: 'Amazon', code: 'amazon', deletedAt: null },
        { id: 'mkt-other', tenantId: OTHER_TENANT, name: 'Other', code: 'mercadolibre', deletedAt: null }
      ],
      priceListProduct: [],
      priceListMarketplace: []
    });
    const repos = repositories(prisma);
    const service = new PriceListService(repos.priceList, repos.product, repos.marketplace, prisma);
    return { prisma, service };
  }

  it('replaces the products of a price list', async () => {
    const { service, prisma } = build();
    const result = await service.setProducts(TENANT, 'list-1', ['prod-1', 'prod-2'], ACTOR);

    expect(result).toEqual(['prod-1', 'prod-2']);
    expect(prisma.__store.priceListProduct).toHaveLength(2);
    expect(prisma.__store.priceListProduct.every((row: any) => row.tenantId === TENANT)).toBe(true);

    await service.setProducts(TENANT, 'list-1', ['prod-1'], ACTOR);
    expect(prisma.__store.priceListProduct).toHaveLength(1);
  });

  it('replaces the marketplaces of a price list', async () => {
    const { service, prisma } = build();
    await service.setMarketplaces(TENANT, 'list-1', ['mkt-1'], ACTOR);
    expect(prisma.__store.priceListMarketplace).toHaveLength(1);
    expect(prisma.__store.priceListMarketplace[0].tenantId).toBe(TENANT);
  });

  it('rejects unknown product ids', async () => {
    const { service } = build();
    await expect(service.setProducts(TENANT, 'list-1', ['ghost'], ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects a product from another company', async () => {
    const { service } = build();
    await expect(service.setProducts(TENANT, 'list-1', ['prod-other'], ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects unknown marketplace ids', async () => {
    const { service } = build();
    await expect(service.setMarketplaces(TENANT, 'list-1', ['ghost'], ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects a marketplace from another company', async () => {
    const { service } = build();
    await expect(service.setMarketplaces(TENANT, 'list-1', ['mkt-other'], ACTOR)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects unknown price lists', async () => {
    const { service } = build();
    await expect(service.setProducts(TENANT, 'ghost', [], ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('allows clearing the relations', async () => {
    const { service, prisma } = build();
    await service.setProducts(TENANT, 'list-1', ['prod-1'], ACTOR);
    await service.setProducts(TENANT, 'list-1', [], ACTOR);
    expect(prisma.__store.priceListProduct).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Catalog access and read model
// ---------------------------------------------------------------------------

describe('PriceListAccessService', () => {
  function build() {
    const prisma = createFakePrisma({
      user: [
        { id: 'user-1', tenantId: TENANT, name: 'Viewer', deletedAt: null },
        { id: 'user-other', tenantId: OTHER_TENANT, name: 'Other', deletedAt: null }
      ],
      priceList: [
        { id: 'list-1', tenantId: TENANT, name: 'Retail', status: 'active', deletedAt: null },
        { id: 'list-2', tenantId: TENANT, name: 'Wholesale', status: 'active', deletedAt: null },
        { id: 'list-other', tenantId: OTHER_TENANT, name: 'Other', status: 'active', deletedAt: null }
      ],
      userPriceListAccess: []
    });
    return { prisma, service: new PriceListAccessService(prisma) };
  }

  it('replaces assignments and keeps them tenant-scoped', async () => {
    const { service, prisma } = build();
    const result = await service.replace(TENANT, 'user-1', ['list-1', 'list-2'], ACTOR);

    expect(result.priceListIds).toEqual(['list-1', 'list-2']);
    expect(prisma.__store.userPriceListAccess).toHaveLength(2);
    expect(prisma.__store.userPriceListAccess.every((row: any) => row.tenantId === TENANT)).toBe(true);
    expect(prisma.__store.userPriceListAccess.every((row: any) => row.createdBy === ACTOR.id)).toBe(true);
    expect(prisma.__store.userPriceListAccess.every((row: any) => row.updatedBy === undefined)).toBe(true);
  });

  it('rejects a list from another company', async () => {
    const { service } = build();
    await expect(service.replace(TENANT, 'user-1', ['list-other'], ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns only assigned lists to a restricted user', async () => {
    const { service } = build();
    await service.replace(TENANT, 'user-1', ['list-2'], ACTOR);
    const user: any = { id: 'user-1', permissions: ['price-catalog:read'], isGlobalAdmin: false };

    await expect(service.visiblePriceLists(TENANT, user)).resolves.toMatchObject([{ id: 'list-2' }]);
  });
});

describe('PriceCatalogService', () => {
  it('calculates the applied discount for the selected list and marketplace', async () => {
    const prisma = createFakePrisma({
      priceList: [{ id: 'list-1', tenantId: TENANT, name: 'Retail', status: 'active', deletedAt: null }],
      marketplace: [{ id: 'mkt-1', tenantId: TENANT, name: 'Amazon', code: 'amazon', status: 'active', deletedAt: null }],
      priceListMarketplace: [{ tenantId: TENANT, priceListId: 'list-1', marketplaceId: 'mkt-1' }],
      userPriceListAccess: [{ tenantId: TENANT, userId: 'user-1', priceListId: 'list-1' }],
      product: [{ id: 'prod-1', tenantId: TENANT, sku: 'SKU-1', name: 'Coffee', status: 'active', deletedAt: null }],
      currency: [{ code: 'MXN', decimals: 2, status: 'active', deletedAt: null }],
      price: [{
        id: 'price-1', tenantId: TENANT, productId: 'prod-1', priceListId: 'list-1', marketplaceId: 'mkt-1',
        basePrice: 100, currencyCode: 'MXN', status: 'active', deletedAt: null,
        startDate: new Date('2024-01-01'), endDate: null, updatedAt: new Date('2024-01-01'),
        priceList: { id: 'list-1', name: 'Retail' },
        marketplace: { id: 'mkt-1', name: 'Amazon', code: 'amazon' },
        product: { id: 'prod-1', sku: 'SKU-1', name: 'Coffee' }
      }],
      discount: [{
        id: 'discount-1', tenantId: TENANT, name: 'Product discount', type: 'percentage', value: 10,
        appliesTo: 'product', productId: 'prod-1', priceListId: null, marketplaceId: null,
        priority: 1, status: 'active', deletedAt: null, startDate: new Date('2024-01-01'), endDate: null,
        createdAt: new Date('2024-01-01')
      }]
    });
    const access = new PriceListAccessService(prisma);
    const service = new PriceCatalogService(prisma, access);
    const user: any = { id: 'user-1', permissions: ['price-catalog:read'], isGlobalAdmin: false };

    const result = await service.list(TENANT, user, {
      page: 1, limit: 20, order: 'asc', priceListId: 'list-1', marketplaceId: 'mkt-1'
    });

    expect(result.data[0]).toMatchObject({ basePrice: 100, discountAmount: 10, finalPrice: 90 });
    expect(result.data[0].appliedDiscount.name).toBe('Product discount');
  });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

describe('DashboardService', () => {
  function build() {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

    const prisma = createFakePrisma({
      product: [
        { id: 'p1', tenantId: TENANT, status: 'active', deletedAt: null },
        { id: 'p2', tenantId: TENANT, status: 'inactive', deletedAt: null },
        { id: 'p3', tenantId: OTHER_TENANT, status: 'active', deletedAt: null }
      ],
      marketplace: [
        { id: 'm1', tenantId: TENANT, name: 'Amazon', code: 'amazon', status: 'active', deletedAt: null },
        { id: 'm2', tenantId: TENANT, name: 'Mercado Libre', code: 'mercadolibre', status: 'active', deletedAt: null }
      ],
      priceList: [{ id: 'l1', tenantId: TENANT, name: 'Retail', status: 'active', deletedAt: null }],
      price: [
        { id: 'pr1', tenantId: TENANT, marketplaceId: 'm1', finalPrice: 100, status: 'active', deletedAt: null },
        { id: 'pr2', tenantId: TENANT, marketplaceId: 'm1', finalPrice: 200, status: 'active', deletedAt: null },
        { id: 'pr3', tenantId: TENANT, marketplaceId: 'm2', finalPrice: 300, status: 'active', deletedAt: null }
      ],
      discount: [
        {
          id: 'd1',
          tenantId: TENANT,
          name: 'Expiring soon',
          status: 'active',
          endDate: soon,
          deletedAt: null
        },
        { id: 'd2', tenantId: TENANT, name: 'Far away', status: 'active', endDate: later, deletedAt: null },
        { id: 'd3', tenantId: TENANT, name: 'No end date', status: 'active', endDate: null, deletedAt: null }
      ]
    });

    return { prisma, service: new DashboardService(prisma) };
  }

  it('summarizes tenant-scoped counts and expiring discounts', async () => {
    const { service } = build();
    const summary = await service.summary(TENANT);

    expect(summary).toMatchObject({ activeProducts: 1, marketplaces: 2, priceLists: 1, activePrices: 3 });
    expect(summary.expiringDiscounts.map((row: any) => row.name)).toEqual(['Expiring soon']);
  });

  it('returns recent prices limited to the tenant', async () => {
    const { service } = build();
    const recent = await service.recentPrices(TENANT, 2);
    expect(recent).toHaveLength(2);
  });

  it('aggregates prices per marketplace', async () => {
    const { service } = build();
    const grouped = await service.pricesByMarketplace(TENANT);

    const amazon = grouped.find((row: any) => row.marketplaceId === 'm1');
    expect(amazon).toMatchObject({ name: 'Amazon', priceCount: 2, averageFinalPrice: 150 });

    const meli = grouped.find((row: any) => row.marketplaceId === 'm2');
    expect(meli.priceCount).toBe(1);
  });
});
