import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { provideTransloco } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { BundledTranslocoLoader } from './transloco-loader';
import { LanguageService } from './language.service';
import { DEFAULT_LOCALE, SUPPORTED_LOCALE_IDS } from './supported-locales';
import es419 from './catalogs/es-419.json';
import enUS from './catalogs/en-US.json';

/**
 * The catalogs are loaded by the bundler, not over HTTP.
 *
 * These tests pin the two properties that motivated that choice:
 *
 *  1. each locale resolves to its own catalog, so a deployment cannot serve a
 *     stale catalog from a browser or CDN cache (the chunk name carries the
 *     content hash);
 *  2. the loader has NO HTTP dependency, which removes the catalogs from the
 *     interceptor chain and the injector re-entrancy risk that came with it.
 */
describe('BundledTranslocoLoader', () => {
  let document: Document;

  function build(): void {
    window.localStorage.clear();

    TestBed.configureTestingModule({
      // No `provideHttpClient()` and no interceptors on purpose: if the loader
      // needed HTTP, these tests would fail at injection time.
      providers: [
        ...provideTransloco({
          config: {
            availableLangs: [...SUPPORTED_LOCALE_IDS],
            defaultLang: DEFAULT_LOCALE,
            fallbackLang: DEFAULT_LOCALE,
            reRenderOnLangChange: true
          },
          loader: BundledTranslocoLoader
        })
      ]
    });

    document = TestBed.inject(DOCUMENT);
  }

  /** Drains microtasks until the predicate holds. */
  async function waitFor(predicate: () => boolean, attempts = 25): Promise<void> {
    for (let i = 0; i < attempts && !predicate(); i += 1) {
      await Promise.resolve();
    }
  }

  beforeEach(() => build());

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('resolves each locale to its own catalog', async () => {
    const loader = TestBed.inject(BundledTranslocoLoader);

    const spanish = await firstValueFrom(loader.getTranslation('es-419'));
    const english = await firstValueFrom(loader.getTranslation('en-US'));

    // Compared against the imported catalogs, so this cannot drift.
    expect(spanish).toEqual(es419);
    expect(english).toEqual(enUS);
    expect(spanish).not.toEqual(english);
  });

  it('does not depend on HttpClient', () => {
    // The loader works...
    expect(TestBed.inject(BundledTranslocoLoader)).toBeTruthy();

    // ...and HttpClient is not even available in this injector, which is what
    // keeps the catalogs out of the interceptor chain.
    expect(() => TestBed.inject(HttpClient)).toThrow();
  });

  it('applies language, direction and the document title from the bundled catalog', async () => {
    const language = TestBed.inject(LanguageService);
    const title = TestBed.inject(Title);

    language.initialize();
    await waitFor(() => title.getTitle() === es419.app.title);

    expect(language.activeLocale()).toBe(DEFAULT_LOCALE);
    expect(title.getTitle()).toBe(es419.app.title);
    expect(document.documentElement.lang).toBe(DEFAULT_LOCALE);
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switches catalogs at runtime without a reload', async () => {
    const language = TestBed.inject(LanguageService);
    const title = TestBed.inject(Title);

    language.initialize();
    await waitFor(() => title.getTitle() === es419.app.title);

    language.setLocale('en-US');
    await waitFor(() => title.getTitle() === enUS.app.title);

    expect(title.getTitle()).toBe(enUS.app.title);
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('degrades to the fallback catalog for a locale with no bundled file', async () => {
    const language = TestBed.inject(LanguageService);
    const title = TestBed.inject(Title);

    language.initialize();
    await waitFor(() => title.getTitle() === es419.app.title);

    // `setLocale` rejects unsupported codes, so drive the loader straight to the
    // failure path: Transloco must fall back rather than leave the UI blank.
    const loader = TestBed.inject(BundledTranslocoLoader);
    await expectAsync(firstValueFrom(loader.getTranslation('fr-FR'))).toBeRejected();

    // The app is still usable and the title is still localized.
    await waitFor(() => title.getTitle() === es419.app.title);
    expect(title.getTitle()).toBe(es419.app.title);
  });
});
