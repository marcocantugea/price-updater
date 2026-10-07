/** Formats a Date/ISO value for an `<input type="date">`. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats a database DATE value using UTC calendar components. */
export function toDateOnlyInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Turns a snake_case / camelCase key into a readable label.
 *
 * Used only for technical identifiers that have no catalog entry (permission
 * slugs, enum codes). It is deliberately NOT a localization helper: user-visible
 * copy belongs in the catalogs.
 */
export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** Safe nested lookup used by the table renderer. */
export function readPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((accumulator, key) => {
      if (accumulator && typeof accumulator === 'object') {
        return (accumulator as Record<string, unknown>)[key];
      }
      return undefined;
    }, source);
}

/*
 * Error localization and money formatting used to live here as `es-MX`-bound
 * module functions. Both moved to injectable services so they can follow the
 * active locale at runtime:
 *
 *   - error envelopes  -> `ApiErrorLocalizerService` (code -> localized copy)
 *   - money/number/date -> `LocaleFormattingService`
 *
 * Nothing locale-dependent should come back to this module: it has no injector,
 * so anything here would freeze a language at import time.
 */
