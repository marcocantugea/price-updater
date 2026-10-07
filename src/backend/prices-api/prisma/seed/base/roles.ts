import { SYSTEM_ROLES } from '../data';

/**
 * Base seed: global/system roles (`tenant_id = null`, `is_system = true`) and
 * their permission assignments. Idempotent by `(tenantId: null, slug)`.
 */
export async function seedRoles(prisma: any): Promise<Record<string, string>> {
  const roleIds: Record<string, string> = {};

  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, slug: role.slug }
    });

    const record = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
            isSystem: true,
            status: 'active'
          }
        })
      : await prisma.role.create({
          data: {
            tenantId: null,
            slug: role.slug,
            name: role.name,
            description: role.description,
            isSystem: true,
            status: 'active',
            createdByType: 'system',
            updatedByType: 'system'
          }
        });

    const permissions = await prisma.permission.findMany({
      where: { slug: { in: role.permissions } }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission: any) => ({
          roleId: record.id,
          permissionId: permission.id
        }))
      });
    }

    roleIds[role.slug] = record.id;
  }

  return roleIds;
}
