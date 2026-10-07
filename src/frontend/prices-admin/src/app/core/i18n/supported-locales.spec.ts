import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_IDS,
  isSupportedLocale,
  localeDirection,
  localeMetadata,
  normalizeBrowserLocale,
  resolveBrowserLocale
} from './supported-locales';

describe('supported locales', () => {
  it('exposes exactly the two canonical locales', () => {
    expect([...SUPPORTED_LOCALE_IDS]).toEqual(['es-419', 'en-US']);
    expect(Object.keys(SUPPORTED_LOCALES).sort()).toEqual(['en-US', 'es-419']);
  });

  it('defaults to Latin American Spanish', () => {
    expect(DEFAULT_LOCALE).toBe('es-419');
    expect(isSupportedLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it('checks support exactly, without normalising', () => {
    expect(isSupportedLocale('es-419')).toBe(true);
    expect(isSupportedLocale('en-US')).toBe(true);

    for (const rejected of ['es', 'en', 'es-MX', 'en-GB', 'ES-419', 'en-us', 'pt-BR', '', null, undefined, 42, {}]) {
      expect(isSupportedLocale(rejected)).toBe(false);
    }
  });

  it('exposes label keys and direction through the metadata helper', () => {
    expect(localeMetadata('es-419')).toEqual({
      labelKey: 'language.es419',
      fullLabelKey: 'language.es419Full',
      direction: 'ltr'
    });
    expect(localeMetadata('en-US').fullLabelKey).toBe('language.enUSFull');

    // Direction is part of the contract from day one so a future RTL language
    // does not require changing it.
    expect(localeDirection('es-419')).toBe('ltr');
    expect(localeDirection('en-US')).toBe('ltr');
  });

  it('returns a stable display order for the selector', () => {
    // Not derived from Object.keys, which is an implementation detail.
    expect(SUPPORTED_LOCALE_IDS[0]).toBe('es-419');
    expect(SUPPORTED_LOCALE_IDS[1]).toBe('en-US');
  });
});

describe('browser locale normalisation', () => {
  it('maps every es-* variant to es-419', () => {
    for (const tag of ['es', 'es-MX', 'es-AR', 'es-419', 'ES-mx', 'es_ES']) {
      expect(normalizeBrowserLocale(tag)).toBe('es-419');
    }
  });

  it('maps every en-* variant to en-US', () => {
    for (const tag of ['en', 'en-US', 'en-GB', 'en-AU', 'EN-gb']) {
      expect(normalizeBrowserLocale(tag)).toBe('en-US');
    }
  });

  it('falls back to the default for unknown, empty and missing values', () => {
    for (const tag of ['fr', 'pt-BR', 'de', '', '   ', null, undefined]) {
      expect(normalizeBrowserLocale(tag)).toBe('es-419');
    }
  });

  it('picks the first supported match from the preference list', () => {
    expect(resolveBrowserLocale(['fr-FR', 'en-GB', 'es-MX'])).toBe('en-US');
    expect(resolveBrowserLocale(['pt-BR', 'es-419'])).toBe('es-419');
    expect(resolveBrowserLocale(['fr-FR', 'de-DE'])).toBe('es-419');
  });

  it('handles an empty or missing preference list', () => {
    expect(resolveBrowserLocale([])).toBe('es-419');
    expect(resolveBrowserLocale(null)).toBe('es-419');
    expect(resolveBrowserLocale(undefined)).toBe('es-419');
  });
});
