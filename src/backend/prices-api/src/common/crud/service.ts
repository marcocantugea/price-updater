import { NotFoundError } from '../errors';
import type { ActorContext, ListQuery, Paginated } from '../../types';
import type { TenantCrudRepository } from './repository';

/**
 * Generic business-layer service. Concrete services extend this class to add
 * domain rules; controllers only ever talk to a service.
 */
export class CrudService<T = any> {
  constructor(
    protected readonly repository: TenantCrudRepository<T>,
    protected readonly resourceName: string = 'Resource'
  ) {}

  async list(tenantId: string | null, query: ListQuery): Promise<Paginated<T>> {
    return this.repository.list(tenantId, query);
  }

  async get(tenantId: string | null, id: string): Promise<T> {
    const found = await this.repository.findById(tenantId, id);
    if (!found) throw new NotFoundError(`${this.resourceName} not found`);
    return found;
  }

  async create(tenantId: string | null, data: Record<string, unknown>, actor: ActorContext): Promise<T> {
    return this.repository.create(tenantId, data, actor);
  }

  async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<T> {
    await this.get(tenantId, id);
    return this.repository.update(tenantId, id, data, actor);
  }

  async remove(tenantId: string | null, id: string, actor: ActorContext): Promise<T> {
    await this.get(tenantId, id);
    return this.repository.softDelete(tenantId, id, actor);
  }
}
