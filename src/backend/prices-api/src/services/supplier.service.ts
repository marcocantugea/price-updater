import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ConflictError } from '../common/errors';
import { auditUpdateFields } from '../common/utils/audit';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

/** Stable code for a supplier name that is already taken in this company. */
export const SUPPLIER_NAME_TAKEN = 'SUPPLIER_NAME_TAKEN';

/**
 * Global supplier catalog.
 *
 * Suppliers are shared by every company — a supplier is a commercial counterpart,
 * not company data — so the catalog has no `tenantId` and only a global
 * administrator may write to it. What *is* tenant-scoped is the link between a
 * product and a supplier, because the product belongs to a company; that link
 * lives in `ProductSupplier` and is untouched here.
 *
 * The generic CRUD stack already covers listing, editing and soft deletion. Two
 * lifecycle rules need domain code on top of it:
 *
 * 1. **Revival instead of duplication.** `name` is unique across *all* rows,
 *    soft-deleted ones included, because a partial index does not exist in MySQL.
 *    Creating a supplier with the name of a deleted one therefore revives that
 *    same row — same id, `deletedAt` cleared — so every product link keeps
 *    pointing at it. The response stays `201`, exactly like a plain create.
 * 2. **An existing row is never silently updated.** A name held by a live row
 *    (active or merely inactive) is a `409` bound to the `name` field; the
 *    client reactivates it through `PATCH` instead. A row that is inactive but
 *    not deleted is *not* a revival candidate: it never released its name.
 *
 * The unique index stays the final authority. The lookup below can lose a race
 * against a concurrent insert, so the `P2002` that follows is mapped onto the
 * same `409` contract rather than surfacing as a raw driver error.
 */
@injectable()
export class SupplierService extends CrudService<any> {
  constructor(@inject(TOKENS.SupplierRepository) repository: TenantCrudRepository<any>) {
    super(repository, 'Supplier');
  }

  private get client(): any {
    return this.repository.client;
  }

  private nameConflict(name: string): ConflictError {
    return new ConflictError(
      `A supplier named '${name}' already exists`,
      SUPPLIER_NAME_TAKEN,
      [
        {
          field: 'name',
          code: SUPPLIER_NAME_TAKEN,
          message: 'already used by another supplier'
        }
      ]
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === 'P2002';
  }

  /**
   * Finds the row that owns `name` **including soft-deleted rows**, which is the
   * lookup the unique index itself performs. Ignoring deleted rows here would
   * turn the revival path into a raw `P2002`.
   */
  private async findByName(name: string): Promise<any | null> {
    return this.client.supplier.findFirst({ where: { name } });
  }

  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const name = String(data.name ?? '').trim();

    try {
      const existing = await this.findByName(name);

      if (existing && existing.deletedAt === null) throw this.nameConflict(name);

      if (existing) {
        // Revival: the id survives, so `product_suppliers` rows keep their FK.
        // Only the submitted editable fields change; `createdBy` still records
        // who created the supplier originally.
        return await this.client.supplier.update({
          where: { id: existing.id },
          data: {
            name,
            status: (data.status as string) ?? 'active',
            deletedAt: null,
            ...auditUpdateFields(actor)
          }
        });
      }

      // `status` is stated explicitly rather than left to the column default, so
      // the create and the revive paths return the same shape.
      return await super.create(
        tenantId,
        { ...data, name, status: (data.status as string) ?? 'active' },
        actor
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.nameConflict(name);
      throw error;
    }
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);
    const name = typeof data.name === 'string' ? data.name.trim() : existing.name;

    try {
      if (name !== existing.name) {
        const owner = await this.findByName(name);
        // A deleted row holding the name cannot be renamed out of the way, so it
        // is a conflict too — the client must revive it instead.
        if (owner && owner.id !== id) throw this.nameConflict(name);
      }

      return await super.update(tenantId, id, { ...data, name }, actor);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.nameConflict(name);
      throw error;
    }
  }
}
