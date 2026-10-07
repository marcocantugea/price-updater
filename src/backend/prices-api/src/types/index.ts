import type { Request } from 'express';
import type { ActorType } from '@prisma/client';
import type { SupportedLocale } from '../common/i18n/supported-locales';

/** Who performed a write operation (audit fields). */
export interface ActorContext {
  id: string | null;
  type: ActorType;
}

export const SYSTEM_ACTOR: ActorContext = { id: null, type: 'system' };

/**
 * Authenticated dashboard user resolved from the JWT access token.
 *
 * `preferredLocale` is presentation state, not authorization data: it is
 * returned by login/refresh/me and deliberately NOT signed into the JWT, so the
 * middleware always reads the current value from the database.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleSlug: string;
  tenantId: string | null;
  isGlobalAdmin: boolean;
  permissions: string[];
  preferredLocale: SupportedLocale;
}

/** API key resolved from the X-API-Key header (external API). */
export interface ApiKeyContext {
  id: string;
  tenantId: string;
  scopes: string[];
}

export interface RequestContext extends Request {
  requestId?: string;
  user?: AuthUser;
  apiKey?: ApiKeyContext;
  /** Tenant resolved for the request (may be null only when unauthenticated). */
  tenantId?: string | null;
  scopes?: string[];
  actor?: ActorContext;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sort?: string;
  order: 'asc' | 'desc';
  [key: string]: unknown;
}
