import { calculateFinalPrice } from '../../../src/services/pricing.engine';

export interface DemoPriceInput {
  tenantId: string;
  products: any[];
  priceLists: any[];
  marketplaces: any[];
  currencyCode?: string;
  decimals?: number;
}

/**
 * Demo seed: one initial price per product x price list x marketplace.
 * `final_price` is computed with the real pricing engine and an append-only
 * `price_history` row (`reason = create`, actor = system) is written.
 * Idempotent — existing prices are reused.
 */
export async function seedDemoPrices(prisma: any, input: DemoPriceInput): Promise<any[]> {
  const { tenantId, products, priceLists, marketplaces } = input;
  const currencyCode = input.currencyCode ?? 'MXN';
  const decimals = input.decimals ?? 2;
  const startDate = new Date();

  const discounts =
    (await prisma.discount.findMany({ where: { tenantId, status: 'active' } })) ?? [];

  const created: any[] = [];

  for (const product of products) {
    for (const priceList of priceLists) {
      for (const marketplace of marketplaces) {
        const existing = await prisma.price.findFirst({
          where: {
            tenantId,
            productId: product.id,
            priceListId: priceList.id,
            marketplaceId: marketplace.id
          }
        });

        if (existing) {
          created.push(existing);
          continue;
        }

        const basePrice = Number(product.basePrice);
        const pricing = calculateFinalPrice(
          {
            productId: product.id,
            priceListId: priceList.id,
            marketplaceId: marketplace.id,
            basePrice,
            currencyDecimals: decimals
          },
          discounts
        );

        const price = await prisma.price.create({
          data: {
            tenantId,
            productId: product.id,
            priceListId: priceList.id,
            marketplaceId: marketplace.id,
            basePrice,
            currencyCode,
            finalPrice: pricing.finalPrice,
            startDate,
            status: 'active',
            notes: 'Precio inicial de ejemplo',
            createdByType: 'system',
            updatedByType: 'system'
          }
        });

        await prisma.priceHistory.create({
          data: {
            tenantId,
            priceId: price.id,
            productId: product.id,
            oldBasePrice: null,
            newBasePrice: price.basePrice,
            oldFinalPrice: null,
            newFinalPrice: price.finalPrice,
            changedByType: 'system',
            changedById: null,
            reason: 'create'
          }
        });

        created.push(price);
      }
    }
  }

  return created;
}
