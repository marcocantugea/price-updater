/**
 * Frontend locale metadata.
 *
 * Mirrors the backend allowlist
 * (`src/backend/prices-api/src/common/i18n/supported-locales.ts`). The canonical
 * BCP 47 codes are the shared contract; everything here is presentation
 * metadata, so adding a language is a two-file code change plus a catalog.
 *
 * `direction` is carried from day one even though both initial locales are
 * left-to-right, so a future RTL language does not require redesigning the
 * contract.
 */
export const SUPPORTED_LOCALES = {
  'es-419': {
    /** Short label shown in the header trigger. */
    labelKey: 'language.es419',
    /** Full self-name shown in the dropdown. */
    fullLabelKey: 'language.es419Full',
    direction: 'ltr'
  },
  'en-US': {
    labelKey: 'language.enUS',
    fullLabelKey: 'language.enUSFull',
    direction: 'ltr'
  }
} as const;

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;
export type LocaleDirection = (typeof SUPPORTED_LOCALES)[SupportedLocale]['direction'];

/** Default for new visitors; preserves the pre-i18n behaviour. */
export const DEFAULT_LOCALE: SupportedLocale = 'es-419';

/**
 * Stable display order for the selector. `Object.keys` order is an
 * implementation detail, not a contract, so it is spelled out.
 */
export const SUPPORTED_LOCALE_IDS: readonly SupportedLocale[] = ['es-419', 'en-US'];

export interface LocaleMetadata {
  labelKey: string;
  fullLabelKey: string;
  direction: LocaleDirection;
}

/** Strict check used for every value that arrives from storage or the API. */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SUPPORTED_LOCALES, value);
}

export function localeMetadata(locale: SupportedLocale): LocaleMetadata {
  return SUPPORTED_LOCALES[locale];
}

export function localeDirection(locale: SupportedLocale): LocaleDirection {
  return SUPPORTED_LOCALES[locale].direction;
}

/**
 * Maps a single browser language tag onto a supported locale.
 *
 * Every `es-*` variant maps to `es-419` and every `en-*` variant to `en-US`;
 * anything else falls back to the default. The API deliberately rejects this
 * loose form, so normalisation happens only here, on the presentation side.
 */
export function normalizeBrowserLocale(tag: string | null | undefined): SupportedLocale {
  if (typeof tag !== 'string') return DEFAULT_LOCALE;

  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (primary === 'en') return 'en-US';
  if (primary === 'es') return 'es-419';
  return DEFAULT_LOCALE;
}

/**
 * First supported match in the browser's preference list. `navigator.languages`
 * is already ordered by preference, so the first hit wins.
 */
export function resolveBrowserLocale(
  languages: readonly string[] | null | undefined
): SupportedLocale {
  if (!languages || languages.length === 0) return DEFAULT_LOCALE;

  for (const language of languages) {
    const primary = typeof language === 'string' ? language.trim().toLowerCase().split(/[-_]/)[0] : '';
    if (primary === 'en') return 'en-US';
    if (primary === 'es') return 'es-419';
  }

  return DEFAULT_LOCALE;
}
