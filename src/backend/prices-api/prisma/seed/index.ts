import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env';
import { shouldRunDemoSeeds } from './policy';
import { seedCurrencies } from './base/currencies';
import { seedPermissions } from './base/permissions';
import { seedRoles } from './base/roles';
import { seedUnitOfMeasures } from './base/unit-of-measures';
import { seedDemoTenant } from './demo/tenants';
import { seedDemoUsers } from './demo/users';
import { seedDemoMarketplaces } from './demo/marketplaces';
import { seedDemoPriceLists } from './demo/price-lists';
import { seedDemoProducts } from './demo/products';
import { seedDemoBrands } from './demo/brands';
import { seedDemoSuppliers } from './demo/suppliers';
import { seedDemoProductSpecifications } from './demo/product-specifications';
import { seedDemoRelations } from './demo/relations';
import { seedDemoDiscount } from './demo/discounts';
import { seedDemoPrices } from './demo/prices';

export interface SeedSummary {
  demoSeeded: boolean;
  currencies: number;
  /**
   * Units the base seed actually **created**. It is 0 on a database that
   * already has every seeded code, including codes an administrator has since
   * edited, deactivated or deleted: the seed inserts missing rows only and never
   * overwrites an existing one.
   */
  unitOfMeasuresInserted: number;
  permissions: number;
  roles: string[];
  demo?: {
    tenantId: string;
    users: string[];
    marketplaces: number;
    priceLists: number;
    products: number;
    brands: number;
    suppliers: number;
    specification: { sku: string; presentations: number; identifiers: number; suppliers: number } | null;
    productLinks: number;
    marketplaceLinks: number;
    discount: string | null;
    prices: number;
  };
}

/**
 * Idempotent seed orchestrator.
 *
 * Base seeds (currencies, permissions, system roles) always run.
 * Demo seeds run only when allowed by policy (see ./policy).
 */
export async function runSeeds(
  prisma: any,
  options: { allowDemo?: boolean } = {}
): Promise<SeedSummary> {
  const allowDemo = options.allowDemo ?? shouldRunDemoSeeds(env);

  const summary: SeedSummary = {
    demoSeeded: allowDemo,
    currencies: await seedCurrencies(prisma),
    unitOfMeasuresInserted: await seedUnitOfMeasures(prisma),
    permissions: await seedPermissions(prisma),
    roles: []
  };

  const roleIds = await seedRoles(prisma);
  summary.roles = Object.keys(roleIds);

  if (!allowDemo) return summary;

  const tenant = await seedDemoTenant(prisma);
  const users = await seedDemoUsers(prisma, { tenantId: tenant.id, roleIds });
  const marketplaces = await seedDemoMarketplaces(prisma, tenant.id);
  const priceLists = await seedDemoPriceLists(prisma, tenant.id, tenant.defaultCurrency);
  const products = await seedDemoProducts(prisma, tenant.id, tenant.defaultCurrency);

  // Catalogs the specification aggregate references, then the aggregate itself.
  const brands = await seedDemoBrands(prisma, tenant.id);
  // The supplier catalog is global, so it is not scoped to the demo company.
  const suppliers = await seedDemoSuppliers(prisma);
  const specification = await seedDemoProductSpecifications(prisma, {
    tenantId: tenant.id,
    products,
    brandIds: brands,
    supplierIds: suppliers
  });

  const relations = await seedDemoRelations(prisma, { products, priceLists, marketplaces });

  // Discounts are seeded before prices so demo final prices reflect them.
  const discount = await seedDemoDiscount(prisma, tenant.id, products[0]?.id ?? null);
  const prices = await seedDemoPrices(prisma, {
    tenantId: tenant.id,
    products,
    priceLists,
    marketplaces,
    currencyCode: tenant.defaultCurrency
  });

  summary.demo = {
    tenantId: tenant.id,
    users: [users.globalAdmin.email, users.tenantAdmin.email],
    marketplaces: marketplaces.length,
    priceLists: priceLists.length,
    products: products.length,
    brands: brands.size,
    suppliers: suppliers.size,
    specification,
    productLinks: relations.productLinks,
    marketplaceLinks: relations.marketplaceLinks,
    discount: discount?.name ?? null,
    prices: prices.length
  };

  return summary;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const summary = await runSeeds(prisma);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (!summary.demoSeeded) {
      // eslint-disable-next-line no-console
      console.log('Demo seeds skipped. Set ALLOW_DEMO_SEED=true or NODE_ENV=development to load them.');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\nInitial development credentials (change them outside local development):');
    // eslint-disable-next-line no-console
    console.log(`  Global admin : ${env.seed.globalAdminEmail}`);
    // eslint-disable-next-line no-console
    console.log(`  Company admin: ${env.seed.tenantAdminEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
