import { TestBed } from '@angular/core/testing';
import { DisplayTextPipe } from './display-text.pipe';
import { LanguageService } from '../core/i18n/language.service';
import { installTestTranslations, provideTranslocoTesting } from '../testing';

describe('DisplayTextPipe', () => {
  let pipe: DisplayTextPipe;
  let language: LanguageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    language = TestBed.inject(LanguageService);
    pipe = TestBed.runInInjectionContext(() => new DisplayTextPipe());
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('resolves every DisplayText form (required by strictTemplates)', () => {
    expect(pipe.transform({ text: 'Precio' })).toBe('Precio');
    expect(pipe.transform({ text: 'Cafetera premium' })).toBe('Cafetera premium');
    expect(pipe.transform({ key: 'common.actions' })).toBe('Acciones');
  });

  it('is impure so a runtime switch rerenders the same value', () => {
    const value = { key: 'common.actions' } as const;

    expect(pipe.transform(value)).toBe('Acciones');

    language.setLocale('en-US');

    expect(pipe.transform(value)).toBe('Actions');
  });

  it('forwards interpolation parameters', () => {
    expect(pipe.transform({ key: 'crud.create' }, { entity: 'producto' })).toBe('Añadir producto');
  });

  it('returns an empty string for null and undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns the key for a missing entry, keeping gaps visible', () => {
    expect(pipe.transform({ key: 'nope.missing' })).toBe('nope.missing');
  });
});
