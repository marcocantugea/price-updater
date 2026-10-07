import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import es419 from '../core/i18n/catalogs/es-419.json';
import enUS from '../core/i18n/catalogs/en-US.json';
import { DEFAULT_LOCALE, SUPPORTED_LOCALE_IDS } from '../core/i18n/supported-locales';
import type { AuthUser } from '../core/models';

/**
 * In-memory catalogs for unit tests.
 *
 * They are the REAL catalog files under `core/i18n/catalogs/`, imported
 * directly, so a spec can never assert copy the application does not ship and no
 * fixture can drift from the catalogs. The loader is Transloco's in-memory one,
 * so unit tests never perform a real asset request.
 */
export const TEST_LANGS: Record<string, Record<string, unknown>> = {
  'es-419': es419 as Record<string, unknown>,
  'en-US': enUS as Record<string, unknown>
};

/**
 * Transloco providers backed by the catalogs. Add to a TestBed's `imports` and
 * then call `installTestTranslations()` to seed them synchronously (the testing
 * module's own initializer is asynchronous, and specs should not have to await it).
 */
export function provideTranslocoTesting() {
  return TranslocoTestingModule.forRoot({
    langs: TEST_LANGS,
    preloadLangs: true,
    translocoConfig: {
      availableLangs: [...SUPPORTED_LOCALE_IDS],
      defaultLang: DEFAULT_LOCALE,
      fallbackLang: DEFAULT_LOCALE,
      reRenderOnLangChange: true
    }
  });
}

/** Seeds both catalogs synchronously and activates the given locale. */
export function installTestTranslations(locale: string = DEFAULT_LOCALE): TranslocoService {
  const transloco = TestBed.inject(TranslocoService);

  for (const [lang, catalog] of Object.entries(TEST_LANGS)) {
    transloco.setTranslation(catalog, lang);
  }
  transloco.setActiveLang(locale);

  return transloco;
}

/** True when the catalog for `locale` defines `key` with a non-empty value. */
export function hasCatalogKey(locale: string, key: string): boolean {
  const catalog = TEST_LANGS[locale];
  if (!catalog) return false;

  const value = key
    .split('.')
    .reduce<unknown>(
      (accumulator, part) =>
        accumulator && typeof accumulator === 'object'
          ? (accumulator as Record<string, unknown>)[part]
          : undefined,
      catalog
    );

  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Shared `AuthUser` fixture.
 *
 * `preferredLocale` is part of the contract, so every spec that builds a user
 * goes through this factory: adding a required field makes the suite fail at
 * compile time instead of at runtime in one forgotten literal.
 */
export function createAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['products:read'],
    preferredLocale: DEFAULT_LOCALE,
    ...overrides
  };
}
