import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/**
 * A client bound to the test database.
 *
 * `tests/setup.integration.ts` has already repointed `DATABASE_URL`, so this is
 * the same construction the application performs. The integration suite
 * deliberately does not get a special client: the point is to exercise the real
 * driver against the real schema.
 */
export function testPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function closeTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/**
 * Creates a tenant with a per-spec unique slug.
 *
 * Every spec builds its own tenant instead of reusing the seeded demo one, so
 * specs cannot observe each other's rows and a failure leaves only its own data
 * behind. The seeded catalogs (currencies, units) are shared: specs read them,
 * and none of them writes to a unit because that catalog is global.
 */
export async function createIsolatedTenant(prisma: any, label: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      commercialName: `Integration ${label}`,
      legalName: `Integration ${label}`,
      slug: `it-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      defaultCurrency: 'MXN',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });

  return tenant.id;
}

/** Removes everything a spec created, children before parents. */
export async function deleteIsolatedTenant(prisma: any, tenantId: string): Promise<void> {
  await prisma.productIdentifier.deleteMany({ where: { tenantId } });
  await prisma.productSupplier.deleteMany({ where: { tenantId } });
  await prisma.productPresentation.deleteMany({ where: { tenantId } });
  await prisma.productSpecification.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.brand.deleteMany({ where: { tenantId } });
  // Suppliers are a global catalog, so they are not owned by the tenant and are
  // cleaned up by `deleteSupplier` instead.
  await prisma.tenant.delete({ where: { id: tenantId } });
}

export async function createProduct(prisma: any, tenantId: string, sku: string): Promise<string> {
  const product = await prisma.product.create({
    data: {
      tenantId,
      sku,
      name: `Product ${sku}`,
      basePrice: 10,
      currencyCode: 'MXN',
      status: 'active',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });

  return product.id;
}

export async function createBrand(prisma: any, tenantId: string, name: string): Promise<string> {
  const brand = await prisma.brand.create({
    data: { tenantId, name, status: 'active', createdByType: 'system', updatedByType: 'system' }
  });

  return brand.id;
}

/**
 * Creates a supplier in the global catalog.
 *
 * No tenant: suppliers are shared by every company now, so a spec must give it a
 * unique name and remove it afterwards with `deleteSupplier`.
 */
export async function createSupplier(prisma: any, name: string): Promise<string> {
  const supplier = await prisma.supplier.create({
    data: { name, status: 'active', createdByType: 'system', updatedByType: 'system' }
  });

  return supplier.id;
}

/** Removes one supplier from the global catalog, links first. */
export async function deleteSupplier(prisma: any, supplierId: string): Promise<void> {
  await prisma.productSupplier.deleteMany({ where: { supplierId } });
  await prisma.supplier.delete({ where: { id: supplierId } });
}

/**
 * Runs a statement that is expected to be rejected by the database.
 *
 * Returns the driver message so a spec can assert *why* it failed. Asserting only
 * that "something threw" would pass for the wrong reason — a typo in the SQL, a
 * missing column, a NOT NULL default — which is the classic way a constraint test
 * turns into a test of nothing.
 */
export async function rejectedStatement(
  prisma: any,
  sql: string,
  params: unknown[] = []
): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql, ...params);
  } catch (error) {
    return String((error as Error).message);
  }

  throw new Error(`Expected the statement to be rejected, but it succeeded:\n${sql}`);
}
