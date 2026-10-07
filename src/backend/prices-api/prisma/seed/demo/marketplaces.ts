import { DEMO_MARKETPLACES } from '../data';

/** Demo seed: marketplaces for the demo company. Idempotent by (tenant, code). */
export async function seedDemoMarketplaces(prisma: any, tenantId: string): Promise<any[]> {
  const result: any[] = [];

  for (const marketplace of DEMO_MARKETPLACES) {
    const existing = await prisma.marketplace.findFirst({
      where: { tenantId, code: marketplace.code }
    });

    result.push(
      existing
        ? await prisma.marketplace.update({
            where: { id: existing.id },
            data: { name: marketplace.name, status: 'active', deletedAt: null }
          })
        : await prisma.marketplace.create({
            data: {
              tenantId,
              name: marketplace.name,
              code: marketplace.code,
              status: 'active',
              createdByType: 'system',
              updatedByType: 'system'
            }
          })
    );
  }

  return result;
}
