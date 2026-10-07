import { DEMO_BRANDS } from '../data';

/**
 * Demo seed: tenant brands.
 *
 * Idempotent (upsert by the unique `(tenantId, name)`), and a soft-deleted brand
 * is revived rather than duplicated — `deletedAt: null` is part of the update so
 * re-running the seeds restores the fixture even after someone deleted it from
 * the UI.
 *
 * Returns a name -> id map so the specification seed can reference a brand by
 * its stable demo name instead of a hardcoded UUID.
 */
export async function seedDemoBrands(
  prisma: any,
  tenantId: string
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const brand of DEMO_BRANDS) {
    const record = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId, name: brand.name } },
      update: { status: 'active', deletedAt: null, updatedByType: 'system' },
      create: {
        tenantId,
        name: brand.name,
        status: 'active',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });

    byName.set(brand.name, record.id);
  }

  return byName;
}
