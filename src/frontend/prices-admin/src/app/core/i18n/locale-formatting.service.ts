import { Injectable, inject } from '@angular/core';
import { LanguageService } from './language.service';
import type { SupportedLocale } from './supported-locales';

export interface DateFormatOptions {
  /** Include `hour:2-digit` / `minute:2-digit`. */
  withTime?: boolean;
  /**
   * Format a database calendar DATE using UTC components, so a value stored as
   * `2026-09-20` does not shift a day in a negative-offset time zone.
   */
  dateOnly?: boolean;
  /**
   * IANA time zone to render in. Independent from the locale: the tenant's time
   * zone is a separate setting, so switching language must not move the clock.
   */
  timeZone?: string;
  /** Forwarded to `Intl`; replaces the default year/month/day combination. */
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  /** Forwarded to `Intl`; may be combined with `dateStyle` only. */
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
}

export type DisplayNameType = 'currency' | 'language' | 'region' | 'script';

/**
 * Locale-aware formatting driven by `LanguageService.activeLocale`.
 *
 * `LOCALE_ID` is not used: it is a bootstrap token, so it cannot follow a
 * runtime language switch. Formatter instances are cached per locale+options
 * because building an `Intl` formatter is the expensive part, and the pipes
 * that consume this service are impure so they re-run on every change
 * detection cycle.
 */
@Injectable({ providedIn: 'root' })
export class LocaleFormattingService {
  private readonly language = inject(LanguageService);

  private readonly dateFormatters = new Map<string, Intl.DateTimeFormat>();
  private readonly numberFormatters = new Map<string, Intl.NumberFormat>();
  private readonly displayNames = new Map<string, Intl.DisplayNames | null>();

  /** The locale every formatter must use right now. */
  get locale(): SupportedLocale {
    return this.language.activeLocale();
  }

  /** Formats an instant or a calendar date; em dash when empty or invalid. */
  formatDate(value: string | Date | number | null | undefined, options: DateFormatOptions = {}): string {
    const date = this.toDate(value);
    if (!date) return '—';

    const { withTime = false, dateOnly = false, timeZone, dateStyle, timeStyle } = options;

    // `Intl` rejects combining dateStyle/timeStyle with explicit year/month/day.
    const intlOptions: Intl.DateTimeFormatOptions =
      dateStyle || timeStyle
        ? { dateStyle, timeStyle }
        : {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
          };

    // A calendar DATE is rendered in UTC; an instant may target the tenant zone.
    if (dateOnly) intlOptions.timeZone = 'UTC';
    else if (timeZone) intlOptions.timeZone = timeZone;

    return this.dateFormatter(this.locale, intlOptions).format(date);
  }

  /** Time-only rendering, used by the settings clock. */
  formatTime(value: string | Date | number | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
    const date = this.toDate(value);
    if (!date) return '—';

    return this.dateFormatter(this.locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options
    }).format(date);
  }

  /**
   * Formats a monetary amount using the price currency. The currency code is
   * never translated; only the separators and symbol position follow the locale.
   */
  formatMoney(value: number | string | null | undefined, currency = 'MXN'): string {
    if (value === null || value === undefined || value === '') return '—';

    const amount = typeof value === 'string' ? Number(value) : value;
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '—';

    const code = currency || 'MXN';
    try {
      return this.numberFormatter(this.locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${code}`;
    }
  }

  /** Plain number formatting with the active locale's separators. */
  formatNumber(
    value: number | string | null | undefined,
    options: Intl.NumberFormatOptions = {}
  ): string {
    if (value === null || value === undefined || value === '') return '—';

    const amount = typeof value === 'string' ? Number(value) : value;
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '—';

    try {
      return this.numberFormatter(this.locale, options).format(amount);
    } catch {
      return String(amount);
    }
  }

  /**
   * Localized name of a currency/language/region code through `Intl.DisplayNames`.
   * Returns `null` when the runtime does not support it or the code is unknown,
   * so callers can fall back to the API-provided name.
   */
  displayName(code: string | null | undefined, type: DisplayNameType = 'currency'): string | null {
    if (typeof code !== 'string' || code.trim() === '') return null;

    const DisplayNamesCtor = (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
    if (typeof DisplayNamesCtor !== 'function') return null;

    const locale = this.locale;
    const cacheKey = `${locale}|${type}`;
    let resolver = this.displayNames.get(cacheKey);

    if (resolver === undefined) {
      try {
        resolver = new DisplayNamesCtor([locale], { type });
      } catch {
        resolver = null;
      }
      this.displayNames.set(cacheKey, resolver);
    }

    if (!resolver) return null;

    try {
      const name = resolver.of(code);
      return typeof name === 'string' && name.trim() !== '' && name !== code ? name : null;
    } catch {
      // Unknown or malformed code.
      return null;
    }
  }

  // --- internals -----------------------------------------------------------

  private toDate(value: string | Date | number | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dateFormatter(locale: SupportedLocale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = this.dateFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      this.dateFormatters.set(key, formatter);
    }
    return formatter;
  }

  private numberFormatter(locale: SupportedLocale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = this.numberFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, options);
      this.numberFormatters.set(key, formatter);
    }
    return formatter;
  }
}
