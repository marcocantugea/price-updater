import crypto from 'node:crypto';
import { env } from '../../config/env';

/** Read-only scopes available in phase 1 (write scopes are a future phase). */
export const PHASE_ONE_SCOPES = [
  'products:read',
  'prices:read',
  'price-lists:read',
  'marketplaces:read'
] as const;

export type PhaseOneScope = (typeof PHASE_ONE_SCOPES)[number];

export type EffectiveApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface ApiKeyLike {
  status: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}

const KEY_PREFIX = 'pg_';

/** Generates a new API key. The plaintext is shown to the caller exactly once. */
export function generateApiKey(): { plaintext: string; prefix: string } {
  const secret = crypto.randomBytes(24).toString('base64url');
  const plaintext = `${KEY_PREFIX}${secret}`;
  return { plaintext, prefix: plaintext.slice(0, 11) };
}

/** Deterministic HMAC hash — only the hash is ever persisted. */
export function hashApiKey(plaintext: string): string {
  return crypto.createHmac('sha256', env.apiKeyHashSecret).update(plaintext).digest('hex');
}

/**
 * Effective status is DERIVED: `revoked` is persisted, `expired` is computed
 * from `expires_at` so the two can never drift out of sync.
 */
export function effectiveApiKeyStatus(key: ApiKeyLike, now: Date = new Date()): EffectiveApiKeyStatus {
  if (key.status === 'revoked' || key.revokedAt) return 'revoked';
  if (key.expiresAt && key.expiresAt.getTime() < now.getTime()) return 'expired';
  return 'active';
}

export function isApiKeyUsable(key: ApiKeyLike, now: Date = new Date()): boolean {
  return effectiveApiKeyStatus(key, now) === 'active';
}

/** Extracts a usable API key from the X-API-Key header value. */
export function extractApiKeyHeader(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  return scopes.filter((scope): scope is string => typeof scope === 'string');
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}
