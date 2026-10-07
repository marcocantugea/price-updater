import { DEMO_PRODUCTS } from '../data';

/**
 * Demo seed: example products. Idempotent by (tenant, sku).
 *
 * Both branches write `cost`, so the demo costs are deterministic across runs
 * even when a developer edited them in between. A `null` cost clears the stored
 * value rather than being skipped: `null` is the "not captured" state, not the
 * absence of an instruction.
 */
export async function seedDemoProducts(
  prisma: any,
  tenantId: string,
  currencyCode = 'MXN'
): Promise<any[]> {
  const result: any[] = [];

  for (const product of DEMO_PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { tenantId, sku: product.sku }
    });

    result.push(
      existing
        ? await prisma.product.update({
            where: { id: existing.id },
            data: {
              name: product.name,
              description: product.description,
              basePrice: product.basePrice,
              cost: product.cost,
              currencyCode,
              status: 'active',
              deletedAt: null
            }
          })
        : await prisma.product.create({
            data: {
              tenantId,
              sku: product.sku,
              name: product.name,
              description: product.description,
              basePrice: product.basePrice,
              cost: product.cost,
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
