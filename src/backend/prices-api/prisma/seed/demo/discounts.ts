import { DEMO_DISCOUNT } from '../data';

/**
 * Demo seed: an active percentage discount scoped to a demo product.
 * Idempotent by (tenant, name).
 */
export async function seedDemoDiscount(
  prisma: any,
  tenantId: string,
  productId: string | null
): Promise<any> {
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  const data = {
    name: DEMO_DISCOUNT.name,
    type: DEMO_DISCOUNT.type,
    value: DEMO_DISCOUNT.value,
    appliesTo: productId ? 'product' : 'marketplace',
    productId: productId ?? null,
    priceListId: null,
    marketplaceId: null,
    startDate,
    endDate,
    priority: DEMO_DISCOUNT.priority,
    status: 'active',
    description: DEMO_DISCOUNT.description
  };

  if (!productId) {
    // No demo product available: fall back to a price-list scoped discount.
    return null;
  }

  const existing = await prisma.discount.findFirst({
    where: { tenantId, name: DEMO_DISCOUNT.name }
  });

  if (existing) {
    return prisma.discount.update({
      where: { id: existing.id },
      data: { ...data, deletedAt: null }
    });
  }

  return prisma.discount.create({
    data: { tenantId, ...data, createdByType: 'system', updatedByType: 'system' }
  });
}
