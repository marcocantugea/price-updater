import { DEMO_TENANT } from '../data';

/** Demo seed: the example company. Idempotent (upsert by unique `slug`). */
export async function seedDemoTenant(prisma: any): Promise<any> {
  return prisma.tenant.upsert({
    where: { slug: DEMO_TENANT.slug },
    update: {
      commercialName: DEMO_TENANT.commercialName,
      legalName: DEMO_TENANT.legalName,
      defaultCurrency: DEMO_TENANT.defaultCurrency,
      timeZone: DEMO_TENANT.timeZone,
      notes: DEMO_TENANT.notes,
      status: 'active'
    },
    create: {
      commercialName: DEMO_TENANT.commercialName,
      legalName: DEMO_TENANT.legalName,
      slug: DEMO_TENANT.slug,
      defaultCurrency: DEMO_TENANT.defaultCurrency,
      timeZone: DEMO_TENANT.timeZone,
      notes: DEMO_TENANT.notes,
      status: 'active',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });
}
