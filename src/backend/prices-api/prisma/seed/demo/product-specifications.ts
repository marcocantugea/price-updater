import { DEMO_SPECIFICATION } from '../data';
import { parseIdentifier } from '../../../src/common/utils/product-identifier';

export interface DemoSpecificationSummary {
  sku: string;
  presentations: number;
  identifiers: number;
  suppliers: number;
}

interface SeedProduct {
  id: string;
  sku: string;
}

/**
 * Demo seed: one complete specification aggregate for `DEMO_SPECIFICATION.sku`.
 *
 * Idempotent by construction, and it reuses the **same** `parseIdentifier` the
 * API uses: an invalid check digit in the fixture makes the seed fail loudly
 * instead of inserting data the API would later reject. That also keeps the demo
 * data a valid example of the contract rather than an unchecked literal.
 *
 * Products are matched by SKU, brands and suppliers by name (via the maps the
 * other demo seeds return), so nothing depends on hardcoded UUIDs.
 */
export async function seedDemoProductSpecifications(
  prisma: any,
  options: {
    tenantId: string;
    products: SeedProduct[];
    brandIds: Map<string, string>;
    supplierIds: Map<string, string>;
  }
): Promise<DemoSpecificationSummary | null> {
  const { tenantId, products, brandIds, supplierIds } = options;
  const seed = DEMO_SPECIFICATION;

  const product = products.find((candidate) => candidate.sku === seed.sku);
  if (!product) return null;

  const brandId = brandIds.get(seed.brandName) ?? null;

  // `null` value AND `null` unit is the "not captured" state; the pair check in
  // the migration enforces that one can never appear without the other.
  const measurements = {
    weight: seed.measurements.weight?.value ?? null,
    weightUnitCode: seed.measurements.weight?.unitCode ?? null,
    length: seed.measurements.length?.value ?? null,
    lengthUnitCode: seed.measurements.length?.unitCode ?? null,
    depth: seed.measurements.depth?.value ?? null,
    depthUnitCode: seed.measurements.depth?.unitCode ?? null
  };

  await prisma.productSpecification.upsert({
    where: { tenantId_productId: { tenantId, productId: product.id } },
    update: { brandId, model: seed.model, ...measurements, status: 'active', deletedAt: null, updatedByType: 'system' },
    create: {
      tenantId,
      productId: product.id,
      brandId,
      model: seed.model,
      ...measurements,
      status: 'active',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });

  let identifiers = 0;

  for (const presentation of seed.presentations) {
    // There is deliberately no unique constraint on the presentation name (it
    // would block recreating a soft-deleted row), so this is find-then-write
    // rather than an upsert.
    const existing = await prisma.productPresentation.findFirst({
      where: { tenantId, productId: product.id, name: presentation.name, deletedAt: null }
    });

    const record = existing
      ? await prisma.productPresentation.update({
          where: { id: existing.id },
          data: {
            quantity: presentation.quantity,
            unitCode: presentation.unitCode,
            status: 'active',
            updatedByType: 'system'
          }
        })
      : await prisma.productPresentation.create({
          data: {
            tenantId,
            productId: product.id,
            name: presentation.name,
            quantity: presentation.quantity,
            unitCode: presentation.unitCode,
            status: 'active',
            createdByType: 'system',
            updatedByType: 'system'
          }
        });

    for (const identifier of presentation.identifiers) {
      const parsed = parseIdentifier(identifier.type, identifier.value);

      // `=== false` rather than `!parsed.ok`: the Jest tsconfig runs with
      // `strict: false`, where TypeScript does not narrow this union on
      // truthiness but does on an explicit literal comparison.
      if (parsed.ok === false) {
        throw new Error(
          `Demo identifier ${identifier.type}:${identifier.value} is invalid (${parsed.reason}). ` +
            'Fix the fixture in prisma/seed/data.ts — the API would reject this value.'
        );
      }

      const data = {
        tenantId,
        productId: product.id,
        presentationId: record.id,
        type: identifier.type,
        value: parsed.parsed.value,
        normalizedValue: parsed.parsed.normalizedValue,
        status: 'active'
      };

      // The GTIN-14 is globally unique per tenant, so the upsert key is the
      // normalized value: re-running never duplicates a barcode.
      await prisma.productIdentifier.upsert({
        where: { tenantId_normalizedValue: { tenantId, normalizedValue: parsed.parsed.normalizedValue } },
        update: { ...data, deletedAt: null, updatedByType: 'system' },
        create: { ...data, createdByType: 'system', updatedByType: 'system' }
      });

      identifiers += 1;
    }
  }

  let suppliers = 0;

  for (const name of seed.supplierNames) {
    const supplierId = supplierIds.get(name);
    if (!supplierId) continue;

    // The natural triple is the primary key, so this revives a soft-deleted link
    // instead of inserting a duplicate.
    await prisma.productSupplier.upsert({
      where: { tenantId_productId_supplierId: { tenantId, productId: product.id, supplierId } },
      update: { status: 'active', deletedAt: null, updatedByType: 'system' },
      create: {
        tenantId,
        productId: product.id,
        supplierId,
        status: 'active',
        createdByType: 'system',
        updatedByType: 'system'
      }
    });

    suppliers += 1;
  }

  return { sku: seed.sku, presentations: seed.presentations.length, identifiers, suppliers };
}
