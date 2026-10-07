import { DEMO_SUPPLIERS } from '../data';

/**
 * Demo seed: the global supplier catalog.
 *
 * Same contract as the brands seed, minus the tenant: suppliers are shared by
 * every company now, so the unique key is the `name` alone. Idempotent, revives a
 * soft-deleted row, and returns a name -> id map so the specification seed can
 * link suppliers without hardcoding UUIDs.
 */
export async function seedDemoSuppliers(prisma: any): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const supplier of DEMO_SUPPLIERS) {
    const record = await prisma.supplier.upsert({
      where: { name: supplier.name },
      update: { status: 'active', deletedAt: null, updatedByType: 'system' },
      create: {
        name: supplier.name,
        status: 'active',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });

    byName.set(supplier.name, record.id);
  }

  return byName;
}
