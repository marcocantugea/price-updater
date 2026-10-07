/** Ensures a join row exists, returning the existing one when present. */
async function ensureJoin(
  prisma: any,
  model: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<any> {
  const existing = await prisma[model].findFirst({ where });
  if (existing) return existing;
  return prisma[model].create({ data });
}

export interface DemoRelationInput {
  products: any[];
  priceLists: any[];
  marketplaces: any[];
}

/**
 * Demo seed: product<->price-list and price-list<->marketplace relations.
 * Idempotent — existing joins are reused.
 */
export async function seedDemoRelations(
  prisma: any,
  { products, priceLists, marketplaces }: DemoRelationInput
): Promise<{ productLinks: number; marketplaceLinks: number }> {
  let productLinks = 0;
  let marketplaceLinks = 0;

  for (const priceList of priceLists) {
    for (const product of products) {
      await ensureJoin(
        prisma,
        'priceListProduct',
        { tenantId: priceList.tenantId, priceListId: priceList.id, productId: product.id },
        { tenantId: priceList.tenantId, priceListId: priceList.id, productId: product.id }
      );
      productLinks += 1;
    }

    for (const marketplace of marketplaces) {
      await ensureJoin(
        prisma,
        'priceListMarketplace',
        { tenantId: priceList.tenantId, priceListId: priceList.id, marketplaceId: marketplace.id },
        { tenantId: priceList.tenantId, priceListId: priceList.id, marketplaceId: marketplace.id }
      );
      marketplaceLinks += 1;
    }
  }

  return { productLinks, marketplaceLinks };
}
