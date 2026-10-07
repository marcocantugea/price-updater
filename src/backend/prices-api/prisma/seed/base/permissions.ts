import { PERMISSION_CATALOG } from '../data';

/** Base seed: the full permission catalog. Idempotent (upsert by `slug`). */
export async function seedPermissions(prisma: any): Promise<number> {
  let count = 0;

  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: {
        name: permission.name,
        description: permission.description
      },
      create: {
        slug: permission.slug,
        name: permission.name,
        description: permission.description,
        createdByType: 'system',
        updatedByType: 'system'
      }
    });
    count += 1;
  }

  return count;
}
