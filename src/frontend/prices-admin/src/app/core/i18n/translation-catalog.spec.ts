import es419 from './catalogs/es-419.json';
import enUS from './catalogs/en-US.json';
import { SUPPORTED_LOCALE_IDS, localeMetadata } from './supported-locales';

type Catalog = Record<string, unknown>;

const CATALOGS: Record<string, Catalog> = {
  'es-419': es419 as Catalog,
  'en-US': enUS as Catalog
};

/** Flattens a nested catalog into dotted key paths. */
function flatten(catalog: Catalog, prefix = ''): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatten(value as Catalog, path));
    } else {
      keys.push(path);
    }
  }

  return keys.sort();
}

/** Reads a dotted key from a nested catalog. */
function read(catalog: Catalog, path: string): unknown {
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Catalog)[key];
    }
    return undefined;
  }, catalog);
}

/** Interpolation placeholders such as `{{minimum}}`. */
function placeholders(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const found = value.match(/\{\{\s*[^{}\s]+\s*\}\}/g) ?? [];
  return found.map((token) => token.replace(/[{}\s]/g, '')).sort();
}

describe('translation catalogs', () => {
  it('has a file for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALE_IDS) {
      expect(CATALOGS[locale]).toBeDefined();
    }
    expect(Object.keys(CATALOGS).sort()).toEqual([...SUPPORTED_LOCALE_IDS].sort());
  });

  it('has a label key for every locale', () => {
    for (const locale of SUPPORTED_LOCALE_IDS) {
      const metadata = localeMetadata(locale);
      for (const catalog of Object.values(CATALOGS)) {
        expect(read(catalog, metadata.labelKey)).toBeTruthy();
        expect(read(catalog, metadata.fullLabelKey)).toBeTruthy();
      }
    }
  });

  it('has recursively identical key sets', () => {
    const reference = flatten(CATALOGS['es-419']);

    for (const locale of SUPPORTED_LOCALE_IDS) {
      const keys = flatten(CATALOGS[locale]);
      const missing = reference.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !reference.includes(key));

      expect(missing).withContext(`${locale} is missing keys`).toEqual([]);
      expect(extra).withContext(`${locale} has keys absent from the reference`).toEqual([]);
    }
  });

  it('has no empty or null values', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const key of flatten(catalog)) {
        const value = read(catalog, key);
        expect(typeof value).withContext(`${locale}.${key} must be a string`).toBe('string');
        expect((value as string).trim()).withContext(`${locale}.${key} must not be empty`).not.toBe('');
      }
    }
  });

  it('uses matching interpolation placeholders between languages', () => {
    const reference = flatten(CATALOGS['es-419']);

    for (const key of reference) {
      const expected = placeholders(read(CATALOGS['es-419'], key));

      for (const locale of SUPPORTED_LOCALE_IDS) {
        expect(placeholders(read(CATALOGS[locale], key)))
          .withContext(`${locale}.${key} placeholders must match`)
          .toEqual(expected);
      }
    }
  });

  it('never ships raw HTML in a catalog value', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const key of flatten(catalog)) {
        const value = read(catalog, key) as string;
        expect(/<\s*(script|iframe|img|a\s)/i.test(value))
          .withContext(`${locale}.${key} must not contain HTML`)
          .toBe(false);
      }
    }
  });

  /**
   * The shared CRUD components resolve these keys directly in their templates, so
   * a missing entry would render a raw key in every module at once. The unit-test
   * fixtures are the real catalogs (see `testing/index.ts`), so this is the one
   * place that guards the shipped copy rather than a fixture.
   */
  it('covers the shared CRUD chrome in both locales', () => {
    const chromeKeys = [
      'common.record',
      'common.actions',
      'common.refresh',
      'common.cancel',
      'common.save',
      'common.saving',
      'common.edit',
      'common.delete',
      'common.deleting',
      'common.close',
      'common.search',
      'common.selectOption',
      'common.enable',
      'common.yes',
      'common.no',
      'common.all',
      'common.activeOnly',
      'common.inactiveOnly',
      'common.pagination',
      'common.previous',
      'common.next',
      'common.reviewFields',
      'autocomplete.noResults',
      'autocomplete.loadError',
      'autocomplete.minLength',
      'crud.create',
      'crud.edit',
      'crud.loading',
      'crud.emptyTitle',
      'crud.emptyHint',
      'crud.formSubtitle',
      'crud.created',
      'crud.updated',
      'crud.deleted',
      'crud.deleteTitle',
      'crud.deleteMessage',
      'crud.preview',
      'crud.previewing',
      'crud.retry',
      'state.loading',
      'state.errorTitle',
      'state.emptyTitle',
      'status.active',
      'status.inactive',
      'status.revoked',
      'status.expired'
    ];

    for (const locale of SUPPORTED_LOCALE_IDS) {
      for (const key of chromeKeys) {
        const value = read(CATALOGS[locale], key);
        expect(value).withContext(`${locale}.${key} is required by the shared UI`).toBeDefined();
        expect((value as string).trim()).not.toBe('');
      }
    }
  });
});
