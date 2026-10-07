import { buildPaginationMeta, toSkipTake } from '../utils/pagination';
import { auditCreateFields, auditDeleteFields, auditUpdateFields } from '../utils/audit';
import { NotFoundError } from '../errors';
import type { ActorContext, ListQuery, Paginated } from '../../types';
import { SAFE_SORT_FIELDS, type CrudModelOptions } from './types';

/**
 * Generic tenant-scoped repository. Every read/write is filtered by the
 * resolved tenant so isolation is enforced at the data-access layer, not only
 * in controllers.
 */
export class TenantCrudRepository<T = any> {
  constructor(
    protected readonly prisma: any,
    protected readonly options: CrudModelOptions
  ) {}

  /** Tenant + soft-delete scope shared by every query. */
  protected baseWhere(tenantId: string | null): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (this.options.tenantScoped) where.tenantId = tenantId;
    if (this.options.hasDeletedAt) where.deletedAt = null;
    return where;
  }

  protected get delegate(): any {
    return this.prisma[this.options.model];
  }

  /** Raw Prisma client for the few cross-tenant lookups (e.g. API keys). */
  get client(): any {
    return this.prisma;
  }

  protected get includeArg(): Record<string, unknown> {
    return this.options.include ? { include: this.options.include } : {};
  }

  protected resolveSortField(requested?: string): string {
    const allowed = new Set<string>([
      ...SAFE_SORT_FIELDS,
      ...(this.options.searchableFields ?? []),
      ...(this.options.filterableFields ?? []),
      ...(this.options.sortableFields ?? []),
      this.options.defaultSortField
    ]);
    return requested && allowed.has(requested) ? requested : this.options.defaultSortField;
  }

  buildWhere(tenantId: string | null, query: ListQuery): Record<string, unknown> {
    const where = this.baseWhere(tenantId);

    if (query.status && this.options.hasStatus !== false) {
      where.status = query.status;
    }

    // The term is trimmed once, here, so neither branch can emit a predicate
    // that matches everything (`contains: ''`) or an empty `OR` array, which
    // Prisma rejects at runtime.
    const term = typeof query.search === 'string' ? query.search.trim() : '';

    if (term !== '') {
      const clauses = this.options.searchWhere
        ? this.options.searchWhere(term)
        : this.options.searchableFields.map((field) => ({
            [field]: { contains: term }
          }));

      if (clauses.length > 0) where.OR = clauses;
    }

    for (const field of this.options.filterableFields) {
      const value = query[field];
      if (typeof value === 'string' && value.trim() !== '') {
        where[field] = value.trim();
      }
    }

    return where;
  }

  async list(tenantId: string | null, query: ListQuery): Promise<Paginated<T>> {
    const where = this.buildWhere(tenantId, query);
    const { skip, take } = toSkipTake(query);
    const sortField = this.resolveSortField(query.sort);
    const order = query.order ?? this.options.defaultSortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.delegate.findMany({
        where,
        skip,
        take,
        orderBy: { [sortField]: order },
        ...this.includeArg
      }),
      this.delegate.count({ where })
    ]);

    return { data: data as T[], meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async findById(tenantId: string | null, id: string): Promise<T | null> {
    const found = await this.delegate.findFirst({
      where: { ...this.baseWhere(tenantId), id },
      ...this.includeArg
    });
    return (found as T) ?? null;
  }

  async findOne(tenantId: string | null, where: Record<string, unknown>): Promise<T | null> {
    const found = await this.delegate.findFirst({
      where: { ...this.baseWhere(tenantId), ...where },
      ...this.includeArg
    });
    return (found as T) ?? null;
  }

  async create(tenantId: string | null, data: Record<string, unknown>, actor: ActorContext): Promise<T> {
    const payload: Record<string, unknown> = {
      ...data,
      ...(this.options.tenantScoped ? { tenantId } : {}),
      ...auditCreateFields(actor)
    };
    return this.delegate.create({ data: payload, ...this.includeArg }) as Promise<T>;
  }

  async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<T> {
    await this.assertExists(tenantId, id);
    return this.delegate.update({
      where: { id },
      data: { ...data, ...auditUpdateFields(actor) },
      ...this.includeArg
    }) as Promise<T>;
  }

  /** Soft delete: marks `deletedAt` and deactivates the record. */
  async softDelete(tenantId: string | null, id: string, actor: ActorContext): Promise<T> {
    await this.assertExists(tenantId, id);
    const data = this.options.hasDeletedAt
      ? { ...auditDeleteFields(actor), status: 'inactive' }
      : auditUpdateFields(actor);
    return this.delegate.update({ where: { id }, data, ...this.includeArg }) as Promise<T>;
  }

  /** Unpaginated read used by domain services (e.g. the discount engine). */
  async findMany(
    tenantId: string | null,
    where: Record<string, unknown> = {},
    orderBy?: Record<string, unknown>
  ): Promise<T[]> {
    const rows = await this.delegate.findMany({
      where: { ...this.baseWhere(tenantId), ...where },
      ...(orderBy ? { orderBy } : {}),
      ...this.includeArg
    });
    return rows as T[];
  }

  async count(tenantId: string | null, extraWhere: Record<string, unknown> = {}): Promise<number> {
    return this.delegate.count({ where: { ...this.baseWhere(tenantId), ...extraWhere } }) as Promise<number>;
  }

  /**
   * Cross-tenant or missing ids resolve to 404 (not 403) so the API never
   * leaks the existence of another tenant's records.
   */
  protected async assertExists(tenantId: string | null, id: string): Promise<void> {
    const existing = await this.findById(tenantId, id);
    if (!existing) throw new NotFoundError();
  }
}
