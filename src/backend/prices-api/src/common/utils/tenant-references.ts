import { ValidationError } from '../errors';
import type { TenantCrudRepository } from '../crud/repository';

export interface TenantReferenceCheck {
  repository: TenantCrudRepository<any>;
  tenantId: string | null;
  id: string | null | undefined;
  /** Field name reported back to the client. */
  field: string;
  /** Human label used in the error message. */
  label: string;
}

/**
 * Ensures every referenced entity belongs to the resolved tenant.
 *
 * Repositories already scope reads by tenant, so an id owned by another tenant
 * resolves to "not found" and is rejected here. This closes the cross-tenant
 * reference hole for relations whose foreign keys are not composite on
 * `tenant_id` (nullable scope references, for example).
 */
export async function assertReferencesBelongToTenant(checks: TenantReferenceCheck[]): Promise<void> {
  for (const check of checks) {
    if (!check.id) continue;

    const found = await check.repository.findOne(check.tenantId, { id: check.id });
    if (!found) {
      throw new ValidationError(`Unknown ${check.label}`, [
        {
          field: check.field,
          message: `the ${check.label} does not exist for this company`
        }
      ]);
    }
  }
}
