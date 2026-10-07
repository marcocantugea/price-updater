import { TenantCrudRepository } from '../common/crud/repository';
import type { CrudModelOptions } from '../common/crud/types';

/**
 * Roles are global/system (tenant_id = null) or owned by a tenant. A tenant's
 * role list therefore includes both.
 */
export class RoleRepository extends TenantCrudRepository<any> {
  constructor(prisma: any, options: CrudModelOptions) {
    super(prisma, options);
  }

  protected override baseWhere(tenantId: string | null): Record<string, unknown> {
    const scope: Record<string, unknown> = {
      OR: [{ tenantId: null }, { tenantId }]
    };
    return {
      deletedAt: null,
      AND: [scope]
    };
  }
}
