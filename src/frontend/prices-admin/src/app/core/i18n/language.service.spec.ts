import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import {
  LanguageService,
  LEGACY_UI_LOCALE_STORAGE_KEY,
  UI_LOCALE_STORAGE_KEY
} from './language.service';

/** Drains microtasks until the predicate holds (the loader resolves async). */
async function waitFor(predicate: () => boolean, attempts = 25): Promise<void> {
  for (let i = 0; i < attempts && !predicate(); i += 1) {
    await Promise.resolve();
  }
}

describe('LanguageService', () => {
  let service: LanguageService;
  let transloco: TranslocoService;
  let document: Document;

  /**
   * `navigator.languages` lives on the prototype, so stubbing it creates an own
   * property. It must be removed afterwards or the stub leaks into every later
   * spec in the same Karma session.
   */
  function stubBrowserLanguages(languages: string[], language?: string): void {
    Object.defineProperty(window.navigator, 'languages', {
      value: languages,
      configurable: true
    });
    Object.defineProperty(window.navigator, 'language', {
      value: language ?? languages[0] ?? '',
      configurable: true
    });
  }

  function restoreBrowserLanguages(): void {
    delete (window.navigator as unknown as Record<string, unknown>)['languages'];
    delete (window.navigator as unknown as Record<string, unknown>)['language'];
  }

  beforeEach(() => {
    window.localStorage.clear();

    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()]
    });

    transloco = installTestTranslations();
    service = TestBed.inject(LanguageService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    restoreBrowserLanguages();
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts on the default locale before initialisation', () => {
    expect(service.activeLocale()).toBe('es-419');
    expect(service.direction()).toBe('ltr');
  });

  it('resolves the guest locale from the browser preference list', () => {
    stubBrowserLanguages(['en-GB', 'es-MX']);

    service.initialize();

    expect(service.activeLocale()).toBe('en-US');
  });

  it('prefers a valid cached locale over the browser preference', () => {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en-US');
    stubBrowserLanguages(['es-MX']);

    service.initialize();

    expect(service.activeLocale()).toBe('en-US');
  });

  it('ignores an invalid or stale cache entry', () => {
    // An unsupported browser preference, so only the cache could produce a hit.
    stubBrowserLanguages(['fr-FR']);

    for (const cached of ['es-MX', 'en', 'fr-FR', '']) {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, cached);
      expect(service.resolveGuestLocale()).toBe('es-419');
    }

    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en-US');
    expect(service.resolveGuestLocale()).toBe('en-US');
  });

  it('falls back to es-419 when nothing matches', () => {
    stubBrowserLanguages(['fr-FR', 'de-DE']);

    service.initialize();

    expect(service.activeLocale()).toBe('es-419');
  });

  describe('storage-key migration', () => {
    it('writes the current key and never the legacy one', () => {
      service.applyUserLocale('en-US');

      expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
      expect(window.localStorage.getItem(LEGACY_UI_LOCALE_STORAGE_KEY)).toBeNull();
    });

    it('honours a guest choice stored under the legacy key and copies it forward', () => {
      // Migrated case: the new key is absent, the pre-rebrand one holds a choice.
      window.localStorage.setItem(LEGACY_UI_LOCALE_STORAGE_KEY, 'en-US');
      stubBrowserLanguages(['es-MX']);

      service.initialize();

      expect(service.activeLocale()).toBe('en-US');
      expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
    });

    it('prefers the current key when both are present', () => {
      window.localStorage.setItem(LEGACY_UI_LOCALE_STORAGE_KEY, 'es-419');
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en-US');

      expect(service.resolveGuestLocale()).toBe('en-US');
    });

    it('ignores an invalid legacy value instead of resurrecting it', () => {
      window.localStorage.setItem(LEGACY_UI_LOCALE_STORAGE_KEY, 'es-MX');
      stubBrowserLanguages(['fr-FR']);

      service.initialize();

      expect(service.activeLocale()).toBe('es-419');
      expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('es-419');
    });

    it('keeps the authenticated preference authoritative over the legacy key', () => {
      // Migrated cache says en-US, the API says es-419: the server wins.
      window.localStorage.setItem(LEGACY_UI_LOCALE_STORAGE_KEY, 'en-US');
      service.initialize();

      service.applyUserLocale('es-419');

      expect(service.activeLocale()).toBe('es-419');
      expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('es-419');
    });

    it('still resolves to the browser locale for a fresh guest', () => {
      // Fresh case: neither key is present.
      stubBrowserLanguages(['en-GB']);

      service.initialize();

      expect(service.activeLocale()).toBe('en-US');
      expect(window.localStorage.getItem(LEGACY_UI_LOCALE_STORAGE_KEY)).toBeNull();
    });
  });

  it('lets the authenticated preference win over cache and browser', () => {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'es-419');
    stubBrowserLanguages(['es-MX']);
    service.initialize();

    service.applyUserLocale('en-US');

    expect(service.activeLocale()).toBe('en-US');
  });

  it('resolves an unknown authenticated value to the default', () => {
    service.applyUserLocale('es-MX');
    expect(service.activeLocale()).toBe('es-419');

    service.applyUserLocale(null);
    expect(service.activeLocale()).toBe('es-419');

    service.applyUserLocale(undefined);
    expect(service.activeLocale()).toBe('es-419');
  });

  it('is idempotent: initialising twice never overwrites an authenticated locale', () => {
    service.applyUserLocale('en-US');

    service.initialize();

    expect(service.activeLocale()).toBe('en-US');
  });

  it('publishes the locale to Transloco, the signal, storage and the document', () => {
    service.applyUserLocale('en-US');

    expect(transloco.getActiveLang()).toBe('en-US');
    expect(service.activeLocale()).toBe('en-US');
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('updates the document title from the active catalog', async () => {
    const title = TestBed.inject(Title);

    service.applyUserLocale('en-US');
    await waitFor(() => title.getTitle() === 'Price Updater — Price administration');
    expect(title.getTitle()).toBe('Price Updater — Price administration');

    service.applyUserLocale('es-419');
    await waitFor(() => title.getTitle() === 'Price Updater — Administración de precios');
    expect(title.getTitle()).toBe('Price Updater — Administración de precios');
  });

  it('switching twice to the same locale is idempotent', () => {
    service.applyUserLocale('en-US');
    service.applyUserLocale('en-US');

    expect(service.activeLocale()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('ignores an unsupported explicit selection', () => {
    service.applyUserLocale('en-US');

    expect(service.setLocale('es-MX' as never)).toBe('en-US');
    expect(service.activeLocale()).toBe('en-US');
    // Nothing corrupted the persisted cache either.
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
  });

  it('returns to the guest locale on logout while keeping the cache', () => {
    service.applyUserLocale('en-US');
    stubBrowserLanguages(['es-MX']);

    expect(service.resetToGuestLocale()).toBe('en-US');
    // The cache survives, so the login page keeps the last used language.
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
    expect(service.activeLocale()).toBe('en-US');
  });

  it('resolves the guest locale without applying it', () => {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en-US');

    expect(service.resolveGuestLocale()).toBe('en-US');
    // Still untouched until initialisation.
    expect(service.activeLocale()).toBe('es-419');
  });

  it('applies the preference carried by an AuthUser-like object', () => {
    expect(service.applyUser({ preferredLocale: 'en-US' })).toBe('en-US');
    expect(service.applyUser(null)).toBe('es-419');
  });

  it('survives a storage that throws', () => {
    const getItem = spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    const setItem = spyOn(Storage.prototype, 'setItem').and.throwError('blocked');

    expect(() => service.initialize()).not.toThrow();
    expect(() => service.applyUserLocale('en-US')).not.toThrow();
    expect(service.activeLocale()).toBe('en-US');

    getItem.and.callThrough();
    setItem.and.callThrough();
  });
});
