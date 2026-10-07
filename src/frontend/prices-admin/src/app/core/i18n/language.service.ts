import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeDirection,
  resolveBrowserLocale,
  SUPPORTED_LOCALE_IDS,
  type LocaleDirection,
  type SupportedLocale
} from './supported-locales';
import type { AuthUser } from '../models';

/**
 * Versioned key for the guest/login fallback. The database is the source of
 * truth for authenticated users; this cache only exists so the login screen and
 * the first paint are localized before the session is restored.
 */
export const UI_LOCALE_STORAGE_KEY = 'price-updater.uiLocale.v1';

/**
 * The pre-rebrand key. Read once and copied forward to
 * `UI_LOCALE_STORAGE_KEY`, so a guest language choice made before the rename
 * survives it. It is never written to again.
 */
export const LEGACY_UI_LOCALE_STORAGE_KEY = 'preciogo.uiLocale.v1';

/** Catalog key holding the localized document title. */
export const DOCUMENT_TITLE_KEY = 'app.title';

/**
 * The only locale facade in the application.
 *
 * Resolution precedence (§3.2 of the plan):
 *
 *   authenticated user preference from the API
 *           ↓
 *   valid cached locale for the login screen
 *           ↓
 *   navigator.languages mapped to a supported locale
 *           ↓
 *   es-419
 *
 * The constructor is deliberately free of I/O and subscriptions: an HTTP call
 * started here would re-enter the interceptor chain, which resolves this very
 * service, before Angular has cached the instance. Everything that touches the
 * network happens in `initialize()` / `activate()` instead.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly localeSignal = signal<SupportedLocale>(DEFAULT_LOCALE);
  private initialized = false;
  private titleSynced = false;

  /** The active locale, readable synchronously (formatters, interceptors). */
  readonly activeLocale = this.localeSignal.asReadonly();

  readonly direction = computed<LocaleDirection>(() => localeDirection(this.localeSignal()));

  /** Every locale the selector may offer, in a stable order. */
  readonly supportedLocales = SUPPORTED_LOCALE_IDS;

  /**
   * Resolves the locale for a visitor with no session and applies it. Idempotent:
   * calling it twice does not re-run the guest resolution, so a later
   * authenticated preference is never overwritten by bootstrap.
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.activate(this.resolveGuestLocale());
  }

  /**
   * Applies the preference returned by the API. During an authenticated session
   * the server-side value always wins, so this overrides cache and browser.
   */
  applyUserLocale(value: unknown): SupportedLocale {
    this.initialized = true;
    return this.activate(isSupportedLocale(value) ? value : DEFAULT_LOCALE);
  }

  /** Applies the preference carried by a session response. */
  applyUser(user: Pick<AuthUser, 'preferredLocale'> | null | undefined): SupportedLocale {
    return this.applyUserLocale(user?.preferredLocale);
  }

  /**
   * Explicit selection (header selector). Accepts only canonical codes; an
   * unsupported value is ignored so the caller cannot corrupt persisted state.
   */
  setLocale(locale: unknown): SupportedLocale {
    if (!isSupportedLocale(locale)) return this.localeSignal();
    this.initialized = true;
    return this.activate(locale);
  }

  /**
   * Returns to the guest resolution after logout. The last UI locale stays in
   * browser storage, so the login page keeps the language the user just used.
   */
  resetToGuestLocale(): SupportedLocale {
    this.initialized = true;
    return this.activate(this.readCachedLocale() ?? resolveBrowserLocale(this.browserLanguages()));
  }

  /** The locale the login screen should use, without applying it. */
  resolveGuestLocale(): SupportedLocale {
    return this.readCachedLocale() ?? resolveBrowserLocale(this.browserLanguages());
  }

  // --- internals -----------------------------------------------------------

  private activate(locale: SupportedLocale): SupportedLocale {
    // Publish the value before any request so the interceptor already carries
    // the right Accept-Language for the catalog it is about to fetch.
    this.localeSignal.set(locale);
    this.transloco.setActiveLang(locale);
    this.updateDocumentMetadata(locale);
    this.persistCachedLocale(locale);
    this.syncDocumentTitle();
    return locale;
  }

  private updateDocumentMetadata(locale: SupportedLocale): void {
    const root = this.document?.documentElement;
    if (!root) return;
    root.lang = locale;
    root.dir = localeDirection(locale);
  }

  /**
   * The title lives in the catalogs, so it must follow runtime switches. A
   * single subscription covers every later change because `selectTranslate`
   * re-emits whenever the active language changes.
   */
  private syncDocumentTitle(): void {
    if (this.titleSynced) return;
    this.titleSynced = true;

    this.transloco
      .selectTranslate<string>(DOCUMENT_TITLE_KEY)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((translated: unknown) => {
        const value = typeof translated === 'string' ? translated.trim() : '';
        // A missing key resolves to the key itself; never show that as a title.
        if (value === '' || value === DOCUMENT_TITLE_KEY) return;
        this.title.setTitle(value);
      });
  }

  private browserLanguages(): readonly string[] {
    const navigator = this.document?.defaultView?.navigator;
    if (!navigator) return [];
    const languages = navigator.languages;
    if (languages && languages.length > 0) return languages;
    return navigator.language ? [navigator.language] : [];
  }

  private storage(): Storage | null {
    try {
      return this.document?.defaultView?.localStorage ?? null;
    } catch {
      // Blocked by privacy settings; the cache is optional.
      return null;
    }
  }

  private readCachedLocale(): SupportedLocale | null {
    try {
      const storage = this.storage();
      if (!storage) return null;

      const current = storage.getItem(UI_LOCALE_STORAGE_KEY);
      if (isSupportedLocale(current)) return current;

      // One-time compatibility read: a choice stored before the rebrand is
      // honoured and copied forward, so the migration happens exactly once and
      // later reads use the new key.
      const legacy = storage.getItem(LEGACY_UI_LOCALE_STORAGE_KEY);
      if (isSupportedLocale(legacy)) {
        storage.setItem(UI_LOCALE_STORAGE_KEY, legacy);
        return legacy;
      }

      return null;
    } catch {
      // Blocked or full storage: fall back to the browser languages.
      return null;
    }
  }

  private persistCachedLocale(locale: SupportedLocale): void {
    try {
      this.storage()?.setItem(UI_LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage full or unavailable: the in-memory locale still applies.
    }
  }
}
