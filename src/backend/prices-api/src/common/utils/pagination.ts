import type { ListQuery, PaginationMeta } from '../../types';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Normalizes and clamps list query parameters from an Express query object. */
export function parseListQuery(raw: Record<string, unknown> | undefined): ListQuery {
  const source = raw ?? {};
  const page = Math.max(1, Math.trunc(Number(source.page)) || 1);

  const requestedLimit = Math.trunc(Number(source.limit));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const order: 'asc' | 'desc' = String(source.order ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const pick = (key: string): string | undefined => {
    const value = source[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  return {
    ...source,
    page,
    limit,
    order,
    search: pick('search'),
    status: pick('status'),
    sort: pick('sort')
  };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0
  };
}

/** Derives the Prisma skip/take pair for a normalized list query. */
export function toSkipTake(query: ListQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}
