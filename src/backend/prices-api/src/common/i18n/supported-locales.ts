import { ValidationError } from '../errors';

/**
 * Allowlist of UI locales accepted by the API.
 *
 * `users.preferred_locale` is a VARCHAR (not a database enum) on purpose: adding
 * a language is a code change here and in the frontend mirror, never a schema
 * migration. This module is the single validation source on the backend.
 *
 * The API deliberately does NOT accept loose/regional variants (`es`, `en`,
 * `es-MX`, `en-GB`, ...). Writes must carry one of the canonical BCP 47 codes;
 * mapping a browser locale onto a canonical code is a presentation concern that
 * belongs to the frontend. Reads are lenient so a legacy or hand-edited row can
 * never break authentication.
 */
export const SUPPORTED_LOCALES = ['es-419', 'en-US'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Default for existing and new users; preserves the pre-i18n behaviour. */
export const DEFAULT_LOCALE: SupportedLocale = 'es-419';

/** Strict check used by validators and self-service writes. */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Lenient read used when mapping a stored/user-supplied row onto `AuthUser`.
 * An unknown or missing column value degrades to the default instead of
 * failing the whole session.
 */
export function normalizeStoredLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Defense in depth for callers that bypass the Zod request schemas (direct
 * service calls, seeds, future jobs). Returns a stable, translatable detail so
 * the frontend can render the message in the user's language.
 */
export function requireSupportedLocale(
  value: unknown,
  field = 'preferredLocale'
): SupportedLocale {
  if (isSupportedLocale(value)) return value;

  throw new ValidationError('Unsupported locale', [
    {
      field,
      code: 'UNSUPPORTED_LOCALE',
      message: `must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
      params: { allowed: [...SUPPORTED_LOCALES] }
    }
  ]);
}
