import type { RequestHandler } from 'express';

/** Declarative description of a tenant-scoped CRUD resource. */
export interface CrudModelOptions {
  /** Prisma delegate key (e.g. `product`). */
  model: string;
  /** When true every query is filtered by the resolved tenant. */
  tenantScoped: boolean;
  /** When true listings exclude rows with `deletedAt != null`. */
  hasDeletedAt: boolean;
  /** When false the model has no `status` column (defaults to true). */
  hasStatus?: boolean;
  /** Text columns used by the `search` query parameter. */
  searchableFields: string[];
  /**
   * Optional relation-aware alternative to `searchableFields`.
   *
   * Direct scalar columns cannot express a search across a related model: Prisma
   * needs a nested filter (`{ product: { is: { sku: { contains: term } } } }`),
   * so a dotted string in `searchableFields` would silently produce an invalid
   * query shape. Models whose text lives behind a relation declare their own
   * clauses here instead.
   *
   * The returned clauses are assigned to the `OR` block of the list query, while
   * the tenant, soft-delete, status and exact-filter predicates stay in the outer
   * `where` object. Return an empty array to express "no search predicate".
   */
  searchWhere?: (term: string) => Record<string, unknown>[];
  /** Exact-match columns accepted from the query string. */
  filterableFields: string[];
  /** Sort column used when the request does not provide one. */
  defaultSortField: string;
  defaultSortOrder?: 'asc' | 'desc';
  /** Prisma `include` applied to reads. */
  include?: Record<string, unknown>;
  /** Columns allowed as `sort` values (defaults to a safe built-in set). */
  sortableFields?: string[];
}

export interface CrudController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

export interface CrudRouterOptions {
  controller: CrudController;
  /** Auth + tenant middlewares applied to every route. */
  guards: RequestHandler[];
  /** Permission required per HTTP verb (checked after the guards). */
  permissions?: {
    read?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
  createValidators?: RequestHandler[];
  updateValidators?: RequestHandler[];
}

export interface ReadOnlyRouterOptions {
  controller: CrudController;
  guards: RequestHandler[];
  readPermission?: string;
}

export const SAFE_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'code', 'sku', 'status'] as const;
