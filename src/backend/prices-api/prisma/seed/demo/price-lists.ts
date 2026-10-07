import { DEMO_PRICE_LISTS } from '../data';

/** Demo seed: price lists for the demo company. Idempotent by (tenant, name). */
export async function seedDemoPriceLists(
  prisma: any,
  tenantId: string,
  currencyCode = 'MXN'
): Promise<any[]> {
  const result: any[] = [];

  for (const priceList of DEMO_PRICE_LISTS) {
    const existing = await prisma.priceList.findFirst({
      where: { tenantId, name: priceList.name }
    });

    result.push(
      existing
        ? await prisma.priceList.update({
            where: { id: existing.id },
            data: {
              description: priceList.description,
              currencyCode,
              status: 'active',
              deletedAt: null
            }
          })
        : await prisma.priceList.create({
            data: {
              tenantId,
              name: priceList.name,
              description: priceList.description,
              currencyCode,
              status: 'active',
              createdByType: 'system',
              updatedByType: 'system'
            }
          })
    );
  }

  return result;
}
