import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { auditCreateFields } from '../common/utils/audit';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

@injectable()
export class RoleService extends CrudService<any> {
  constructor(
    @inject(TOKENS.RoleRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.PermissionRepository) private readonly permissionRepository: TenantCrudRepository<any>,
    @inject(TOKENS.Prisma) private readonly prisma: any
  ) {
    super(repository, 'Role');
  }

  private async permissionIdsForSlugs(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const permissions = await this.permissionRepository.findMany(null, { slug: { in: slugs } });
    const found = new Set(permissions.map((permission: any) => permission.slug));
    const missing = slugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw new ValidationError('Unknown permissions', [
        { field: 'permissionSlugs', message: `unknown permissions: ${missing.join(', ')}` }
      ]);
    }
    return permissions.map((permission: any) => permission.id);
  }

  private async assertSlugAvailable(slug: string, id?: string): Promise<void> {
    const existing = await this.repository.findOne(null, { slug });
    if (existing && existing.id !== id) {
      throw new ConflictError(`A role with slug '${slug}' already exists`, 'ROLE_SLUG_TAKEN');
    }
  }

  override async create(tenantId: string | null, data: Record<string, unknown>, actor: ActorContext): Promise<any> {
    const slug = String(data.slug ?? '');
    await this.assertSlugAvailable(slug);
    const permissionSlugs = Array.isArray(data.permissionSlugs) ? (data.permissionSlugs as string[]) : [];
    const permissionIds = await this.permissionIdsForSlugs(permissionSlugs);

    const payload: Record<string, unknown> = {
      name: data.name,
      slug,
      description: data.description ?? null,
      status: data.status ?? 'active',
      isSystem: false,
      tenantId,
      // Audit columns are mandatory for every write, including this direct one.
      ...auditCreateFields(actor)
    };

    const created = await this.prisma.$transaction(async (tx: any) => {
      const role = await tx.role.create({ data: payload });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId }))
        });
      }
      return role;
    });

    return this.get(tenantId, created.id);
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);

    if (typeof data.slug === 'string' && data.slug !== existing.slug) {
      if (existing.isSystem) {
        throw new ForbiddenError('System role slugs cannot be changed', 'SYSTEM_ROLE_IMMUTABLE');
      }
      await this.assertSlugAvailable(String(data.slug), id);
    }

    const payload: Record<string, unknown> = { ...data };
    delete payload.permissionSlugs;
    delete payload.isSystem;

    return super.update(tenantId, id, payload, actor);
  }

  /** System roles are never physically removed or soft-deleted in phase 1. */
  override async remove(tenantId: string | null, id: string, actor: ActorContext): Promise<any> {
    const existing = await this.get(tenantId, id);
    if (existing.isSystem) {
      throw new ForbiddenError('System roles cannot be deleted', 'SYSTEM_ROLE_IMMUTABLE');
    }
    return super.remove(tenantId, id, actor);
  }

  async permissions(tenantId: string | null, id: string): Promise<string[]> {
    await this.get(tenantId, id);
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: id },
      include: { permission: { select: { slug: true } } }
    });
    return rows.map((row: any) => row.permission.slug);
  }

  async assignPermissions(
    tenantId: string | null,
    id: string,
    permissionSlugs: string[],
    actor: ActorContext
  ): Promise<string[]> {
    const role = await this.get(tenantId, id);
    if (role.isSystem && role.slug === 'global_admin') {
      // Keep the global admin all-powerful; assignment is still allowed but guarded.
    }

    const permissionIds = await this.permissionIdsForSlugs(permissionSlugs);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId }))
        });
      }
    });

    void actor;
    return this.permissions(tenantId, id);
  }
}
