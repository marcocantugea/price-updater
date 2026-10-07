import { runSeeds } from '../../prisma/seed/index';
import { shouldRunDemoSeeds } from '../../prisma/seed/policy';
import { seedCurrencies } from '../../prisma/seed/base/currencies';
import { seedPermissions } from '../../prisma/seed/base/permissions';
import { seedRoles } from '../../prisma/seed/base/roles';
import { seedUnitOfMeasures } from '../../prisma/seed/base/unit-of-measures';
import { seedDemoTenant } from '../../prisma/seed/demo/tenants';
import { seedDemoPrices } from '../../prisma/seed/demo/prices';
import { createDemoApiKey } from '../../prisma/seed/demo/api-key';
import {
  ALL_PERMISSION_SLUGS,
  CURRENCIES,
  DEMO_TENANT,
  DEMO_USER_LOCALE,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  READONLY_USER_PERMISSIONS,
  SYSTEM_ROLES,
  TENANT_ADMIN_EXCLUDED,
  TENANT_USER_PERMISSIONS,
  UNIT_OF_MEASURES
} from '../../prisma/seed/data';
import { hashApiKey, PHASE_ONE_SCOPES } from '../../src/common/utils/api-key';
import { DEFAULT_LOCALE, isSupportedLocale } from '../../src/common/i18n/supported-locales';
import { createFakePrisma } from '../helpers/fake-prisma';

describe('seed policy (demo seed protection)', () => {
  it('allows demo seeds in development', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'development', allowDemoSeed: false })).toBe(true);
  });

  it('allows demo seeds with an explicit opt-in', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'production', allowDemoSeed: true })).toBe(true);
  });

  it('blocks demo seeds in staging/production by default', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'production', allowDemoSeed: false })).toBe(false);
    expect(shouldRunDemoSeeds({ nodeEnv: 'staging', allowDemoSeed: false })).toBe(false);
    expect(shouldRunDemoSeeds({ nodeEnv: 'test', allowDemoSeed: false })).toBe(false);
  });
});

describe('seed catalogs', () => {
  it('defines MXN and USD', () => {
    expect(CURRENCIES.map((currency) => currency.code)).toEqual(['MXN', 'USD']);
    expect(CURRENCIES.every((currency) => currency.decimals === 2)).toBe(true);
  });

  it('builds the full module:action permission catalog', () => {
    // Derived from PERMISSION_MODULES rather than a hardcoded count: adding a
    // module or an action must not require editing a magic number here.
    const expectedCount = Object.values(PERMISSION_MODULES).reduce(
      (total, actions) => total + actions.length,
      0
    );

    expect(PERMISSION_CATALOG).toHaveLength(expectedCount);
    // Every module:action pair is unique, so no slug is silently shadowed.
    expect(new Set(ALL_PERMISSION_SLUGS).size).toBe(expectedCount);

    expect(ALL_PERMISSION_SLUGS).toContain('products:read');
    expect(ALL_PERMISSION_SLUGS).toContain('prices:calculate');
    expect(ALL_PERMISSION_SLUGS).toContain('api-keys:revoke');
    expect(ALL_PERMISSION_SLUGS).toContain('roles:assign-permissions');
    expect(ALL_PERMISSION_SLUGS).toContain('tenants:switch');
    expect(ALL_PERMISSION_SLUGS).toContain('currencies:read');

    // Added by the product-specification feature. Specifications themselves
    // reuse the Product permissions; these cover the catalogs they need.
    expect(ALL_PERMISSION_SLUGS).toContain('brands:read');
    expect(ALL_PERMISSION_SLUGS).toContain('brands:delete');
    expect(ALL_PERMISSION_SLUGS).toContain('suppliers:update');
    expect(ALL_PERMISSION_SLUGS).toContain('units-of-measure:read');
    // TEC-43 makes the global unit catalog administrable. The three write slugs
    // exist for the global administrator, and no tenant role may hold them.
    expect(ALL_PERMISSION_SLUGS).toContain('units-of-measure:create');
    expect(ALL_PERMISSION_SLUGS).toContain('units-of-measure:update');
    expect(ALL_PERMISSION_SLUGS).toContain('units-of-measure:delete');
  });

  it('defines the system roles', () => {
    expect(SYSTEM_ROLES.map((role) => role.slug)).toEqual([
      'global_admin',
      'tenant_admin',
      'tenant_user',
      'readonly_user',
      'price_catalog_viewer'
    ]);
  });

  it('gives the global admin every permission', () => {
    const globalAdmin = SYSTEM_ROLES.find((role) => role.slug === 'global_admin')!;
    expect(globalAdmin.permissions).toHaveLength(ALL_PERMISSION_SLUGS.length);
  });

  it('removes global company management and global catalog writes from the tenant admin', () => {
    const tenantAdmin = SYSTEM_ROLES.find((role) => role.slug === 'tenant_admin')!;
    for (const excluded of TENANT_ADMIN_EXCLUDED) {
      expect(tenantAdmin.permissions).not.toContain(excluded);
    }
    expect(tenantAdmin.permissions).toContain('tenants:read');
    expect(tenantAdmin.permissions).toContain('users:create');
    // Both global catalogs are read-only for a company: writing to a unit or a
    // supplier is visible to every company, so it is a global-administrator
    // capability.
    expect(tenantAdmin.permissions).toContain('units-of-measure:read');
    expect(tenantAdmin.permissions).not.toContain('units-of-measure:update');
    expect(tenantAdmin.permissions).toContain('suppliers:read');
    expect(tenantAdmin.permissions).not.toContain('suppliers:create');
    expect(tenantAdmin.permissions).not.toContain('suppliers:update');
    expect(tenantAdmin.permissions).not.toContain('suppliers:delete');
  });

  it('gives the operator and read-only roles their documented scopes', () => {
    const operator = SYSTEM_ROLES.find((role) => role.slug === 'tenant_user')!;
    expect(operator.permissions).toEqual(TENANT_USER_PERMISSIONS);
    expect(operator.permissions).not.toContain('users:create');

    const readonly = SYSTEM_ROLES.find((role) => role.slug === 'readonly_user')!;
    expect(readonly.permissions).toEqual(READONLY_USER_PERMISSIONS);
    expect(readonly.permissions.every((slug) => slug.endsWith(':read'))).toBe(true);

    // `settings:read` is what makes the Suppliers navigation section reachable
    // for the two roles that may read suppliers. Neither gains any edit right:
    // the editable Settings controls keep their own `settings:update` gate.
    expect(operator.permissions).toContain('settings:read');
    expect(operator.permissions).not.toContain('settings:update');
    expect(readonly.permissions).toContain('settings:read');
    expect(readonly.permissions).not.toContain('settings:update');
  });
});

describe('base seeds', () => {
  it('inserts currencies idempotently', async () => {
    const prisma = createFakePrisma();

    await seedCurrencies(prisma);
    await seedCurrencies(prisma);

    expect(prisma.__store.currency).toHaveLength(2);
    expect(prisma.__store.currency.map((row: any) => row.code).sort()).toEqual(['MXN', 'USD']);
  });

  it('inserts permissions idempotently', async () => {
    const prisma = createFakePrisma();

    await seedPermissions(prisma);
    await seedPermissions(prisma);

    expect(prisma.__store.permission).toHaveLength(PERMISSION_CATALOG.length);
  });

  it('inserts system roles with permissions idempotently', async () => {
    const prisma = createFakePrisma();

    await seedPermissions(prisma);
    const first = await seedRoles(prisma);
    const second = await seedRoles(prisma);

    expect(prisma.__store.role).toHaveLength(5);
    expect(Object.keys(first).sort()).toEqual(['global_admin', 'price_catalog_viewer', 'readonly_user', 'tenant_admin', 'tenant_user']);
    expect(first.global_admin).toBe(second.global_admin);

    // No duplicated role_permission rows on the second run.
    const globalAdminLinks = prisma.__store.rolePermission.filter(
      (row: any) => row.roleId === first.global_admin
    );
    expect(globalAdminLinks).toHaveLength(ALL_PERMISSION_SLUGS.length);
  });

  it('inserts the base units once and never overwrites an edited or deleted one', async () => {
    const prisma = createFakePrisma();

    const firstRun = await seedUnitOfMeasures(prisma);
    expect(firstRun).toBe(UNIT_OF_MEASURES.length);
    expect(prisma.__store.unitOfMeasure).toHaveLength(UNIT_OF_MEASURES.length);

    // An administrator renames, retightens and deactivates one unit...
    await prisma.unitOfMeasure.update({
      where: { code: 'KG' },
      data: { name: 'Kilo', decimals: 1, status: 'inactive' }
    });
    // ...and soft-deletes another. Deleting never releases the code, so the seed
    // must count the row as existing instead of resurrecting it.
    await prisma.unitOfMeasure.update({
      where: { code: 'OZ' },
      data: { deletedAt: new Date(), status: 'inactive' }
    });

    const secondRun = await seedUnitOfMeasures(prisma);

    expect(secondRun).toBe(0);
    expect(prisma.__store.unitOfMeasure).toHaveLength(UNIT_OF_MEASURES.length);
    expect(await prisma.unitOfMeasure.findUnique({ where: { code: 'KG' } })).toMatchObject({
      name: 'Kilo',
      decimals: 1,
      status: 'inactive'
    });
    expect((await prisma.unitOfMeasure.findUnique({ where: { code: 'OZ' } })).deletedAt).not.toBeNull();
  });

  it('marks system roles as is_system with a null tenant', async () => {
    const prisma = createFakePrisma();
    await seedPermissions(prisma);
    await seedRoles(prisma);

    expect(prisma.__store.role.every((row: any) => row.isSystem === true && row.tenantId === null)).toBe(true);
  });

  it('creates the demo company idempotently', async () => {
    const prisma = createFakePrisma({ currency: [{ code: 'MXN', name: 'Peso' }] });

    await seedDemoTenant(prisma);
    await seedDemoTenant(prisma);

    expect(prisma.__store.tenant).toHaveLength(1);
    expect(prisma.__store.tenant[0]).toMatchObject({
      slug: DEMO_TENANT.slug,
      commercialName: 'Demo Company',
      legalName: 'Demo Company S.A. de C.V.',
      defaultCurrency: 'MXN'
    });
  });
});

describe('runSeeds orchestrator', () => {
  it('runs only base seeds when demo is disabled', async () => {
    const prisma = createFakePrisma();
    const summary = await runSeeds(prisma, { allowDemo: false });

    expect(summary.demoSeeded).toBe(false);
    expect(summary.demo).toBeUndefined();
    expect(summary.currencies).toBe(2);
    expect(summary.unitOfMeasuresInserted).toBe(UNIT_OF_MEASURES.length);
    expect(summary.permissions).toBe(PERMISSION_CATALOG.length);
    expect(summary.roles).toHaveLength(5);

    expect(prisma.__store.tenant ?? []).toHaveLength(0);
    expect(prisma.__store.user ?? []).toHaveLength(0);
    expect(prisma.__store.product ?? []).toHaveLength(0);
  });

  it('creates the full demo dataset when enabled', async () => {
    const prisma = createFakePrisma();
    const summary = await runSeeds(prisma, { allowDemo: true });

    expect(summary.demoSeeded).toBe(true);
    expect(summary.demo).toMatchObject({
      marketplaces: 3,
      priceLists: 3,
      products: 3,
      productLinks: 9,
      marketplaceLinks: 9,
      discount: 'Descuento demo 10%'
    });
    // 3 products x 3 lists x 3 marketplaces
    expect(summary.demo?.prices).toBe(27);

    expect(prisma.__store.user).toHaveLength(2);
    expect(prisma.__store.priceHistory).toHaveLength(27);
  });

  it('creates a global admin with no tenant and a company admin bound to the demo company', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const users = prisma.__store.user;
    const globalAdmin = users.find((row: any) => row.tenantId === null);
    const tenantAdmin = users.find((row: any) => row.tenantId !== null);

    expect(globalAdmin).toBeTruthy();
    expect(tenantAdmin.tenantId).toBe(prisma.__store.tenant[0].id);
  });

  it('hashes the seeded passwords', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    for (const user of prisma.__store.user) {
      expect(user.passwordHash).toBeTruthy();
      expect(user.passwordHash).not.toContain('ChangeMe');
      expect(user.passwordHash.length).toBeGreaterThan(20);
    }
  });

  it('gives every seeded user an explicit, supported locale', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    expect(DEMO_USER_LOCALE).toBe('es-419');
    expect(isSupportedLocale(DEMO_USER_LOCALE)).toBe(true);
    // Pinned explicitly rather than inherited, so the demo copy stays Spanish.
    expect(DEFAULT_LOCALE).toBe('es-419');

    for (const user of prisma.__store.user) {
      expect(isSupportedLocale(user.preferredLocale)).toBe(true);
      expect(user.preferredLocale).toBe('es-419');
    }
  });

  it('keeps the seeded locale stable across reruns', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    // Simulate a user who switched to English between two seed runs.
    prisma.__store.user.forEach((row: any) => {
      row.preferredLocale = 'en-US';
    });

    await runSeeds(prisma, { allowDemo: true });

    // The demo seed is a deterministic reset, so it restores the pinned locale.
    expect(prisma.__store.user.map((row: any) => row.preferredLocale)).toEqual([
      DEMO_USER_LOCALE,
      DEMO_USER_LOCALE
    ]);
  });

  it('writes price history with the system actor and reason=create', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    for (const row of prisma.__store.priceHistory) {
      expect(row.reason).toBe('create');
      expect(row.changedByType).toBe('system');
      expect(row.changedById).toBeNull();
    }
  });

  it('is idempotent: running twice does not duplicate data', async () => {
    const prisma = createFakePrisma();

    await runSeeds(prisma, { allowDemo: true });
    const afterFirst = {
      currencies: prisma.__store.currency.length,
      permissions: prisma.__store.permission.length,
      roles: prisma.__store.role.length,
      tenants: prisma.__store.tenant.length,
      users: prisma.__store.user.length,
      marketplaces: prisma.__store.marketplace.length,
      priceLists: prisma.__store.priceList.length,
      products: prisma.__store.product.length,
      prices: prisma.__store.price.length,
      history: prisma.__store.priceHistory.length,
      discounts: prisma.__store.discount.length,
      links: prisma.__store.priceListProduct.length + prisma.__store.priceListMarketplace.length
    };

    await runSeeds(prisma, { allowDemo: true });

    expect({
      currencies: prisma.__store.currency.length,
      permissions: prisma.__store.permission.length,
      roles: prisma.__store.role.length,
      tenants: prisma.__store.tenant.length,
      users: prisma.__store.user.length,
      marketplaces: prisma.__store.marketplace.length,
      priceLists: prisma.__store.priceList.length,
      products: prisma.__store.product.length,
      prices: prisma.__store.price.length,
      history: prisma.__store.priceHistory.length,
      discounts: prisma.__store.discount.length,
      links: prisma.__store.priceListProduct.length + prisma.__store.priceListMarketplace.length
    }).toEqual(afterFirst);
  });

  it('reflects the demo discount in the seeded final prices', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const discounted = prisma.__store.price.filter((row: any) => Number(row.basePrice) === 100);
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted.every((row: any) => Number(row.finalPrice) === 90)).toBe(true);
  });
});

describe('demo price seeding details', () => {
  it('skips prices that already exist', async () => {
    const prisma = createFakePrisma({
      discount: [],
      price: [
        {
          id: 'existing',
          tenantId: 't1',
          productId: 'p1',
          priceListId: 'l1',
          marketplaceId: 'm1',
          basePrice: 10,
          finalPrice: 10
        }
      ]
    });

    const created = await seedDemoPrices(prisma, {
      tenantId: 't1',
      products: [{ id: 'p1', basePrice: 10 }],
      priceLists: [{ id: 'l1' }],
      marketplaces: [{ id: 'm1' }]
    });

    expect(created).toHaveLength(1);
    expect(prisma.__store.price).toHaveLength(1);
    expect(prisma.__store.priceHistory ?? []).toHaveLength(0);
  });
});

describe('demo product cost seeding', () => {
  it('writes the three deterministic demo costs, including an unknown one', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const bySku = (sku: string) => prisma.__store.product.find((row: any) => row.sku === sku);

    expect(bySku('SKU-DEMO-001').cost).toBe(60);
    expect(bySku('SKU-DEMO-002').cost).toBe(175);
    // Unknown cost stays NULL: it must never be seeded as a zero cost.
    expect(bySku('SKU-DEMO-003').cost).toBeNull();
    expect(bySku('SKU-DEMO-003').cost).not.toBe(0);
  });

  it('keeps the costs deterministic on a second run', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    // A developer edited a cost between two seed runs.
    const edited = prisma.__store.product.find((row: any) => row.sku === 'SKU-DEMO-001');
    edited.cost = 1;

    await runSeeds(prisma, { allowDemo: true });

    const products = prisma.__store.product.filter((row: any) => row.sku.startsWith('SKU-DEMO-'));
    expect(products).toHaveLength(3);
    expect(prisma.__store.product.find((row: any) => row.sku === 'SKU-DEMO-001').cost).toBe(60);
  });

  it('sets a cost on an existing product that had none', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const existing = prisma.__store.product.find((row: any) => row.sku === 'SKU-DEMO-002');
    existing.cost = null;

    await runSeeds(prisma, { allowDemo: true });

    expect(prisma.__store.product.find((row: any) => row.sku === 'SKU-DEMO-002').cost).toBe(175);
  });
});

describe('demo API key command', () => {
  it('returns null when the demo company is missing', async () => {
    const prisma = createFakePrisma();
    await expect(createDemoApiKey(prisma)).resolves.toBeNull();
  });

  it('stores only the hash and returns the plaintext once', async () => {
    const prisma = createFakePrisma({
      tenant: [{ id: 't1', slug: 'demo-company', commercialName: 'Demo', deletedAt: null }]
    });

    const result = await createDemoApiKey(prisma);
    expect(result).not.toBeNull();

    const stored = prisma.__store.apiKey[0];
    expect(stored.keyHash).toBe(hashApiKey(result!.plaintextKey));
    expect(stored.keyHash).not.toBe(result!.plaintextKey);
    expect(stored.scopes).toEqual([...PHASE_ONE_SCOPES]);
    expect(stored.status).toBe('active');
  });
});
