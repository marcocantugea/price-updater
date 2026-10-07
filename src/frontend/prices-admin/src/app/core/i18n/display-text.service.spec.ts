import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { DisplayTextService } from './display-text.service';
import { LanguageService } from './language.service';

describe('DisplayTextService', () => {
  let service: DisplayTextService;
  let language: LanguageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    language = TestBed.inject(LanguageService);
    service = TestBed.inject(DisplayTextService);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('resolves litteral business data verbatim', () => {
    expect(service.resolve({ text: 'Cafetera premium' })).toBe('Cafetera premium');
  });

  it('resolves a plain transitional string', () => {
    expect(service.resolve({ text: 'Precio' })).toBe('Precio');
  });

  it('translates a key', () => {
    expect(service.resolve({ key: 'common.actions' })).toBe('Acciones');
  });

  it('interpolates parameters and lets the call site override them', () => {
    expect(service.resolve({ key: 'common.pagination', params: { page: 1, totalPages: 2, total: 5 } })).toBe(
      'Página 1 de 2 · 5 registros'
    );
    // An explicit parameter wins over the one carried by the key.
    expect(service.resolve({ key: 'common.pagination', params: { page: 1, totalPages: 2, total: 5 } }, { page: 9 })).toBe(
      'Página 9 de 2 · 5 registros'
    );
  });

  it('handles empty values', () => {
    expect(service.resolve(null)).toBe('');
    expect(service.resolve(undefined)).toBe('');
  });

  it('returns the key itself for an unknown key, so gaps stay visible', () => {
    expect(service.resolve({ key: 'nope.missing' })).toBe('nope.missing');
  });

  it('reports whether a key exists in the catalog', () => {
    expect(service.has('common.actions')).toBe(true);
    expect(service.has('nope.missing')).toBe(false);
  });

  it('makes an enclosing computed reactive to language changes', () => {
    const label = computed(() => service.resolve({ key: 'common.actions' }));
    expect(label()).toBe('Acciones');

    language.setLocale('en-US');

    // No manual invalidation: reading activeLang() inside resolve() registered
    // the dependency.
    expect(label()).toBe('Actions');
  });

  it('translates a key directly', () => {
    expect(service.translate('crud.create', { entity: 'producto' })).toBe('Añadir producto');

    language.setLocale('en-US');
    expect(service.translate('crud.create', { entity: 'producto' })).toBe('Add producto');
  });

  it('keeps a signal-driven key reactive', () => {
    const key = signal('common.actions');
    const label = computed(() => service.resolve({ key: key() }));

    expect(label()).toBe('Acciones');
    key.set('common.refresh');
    expect(label()).toBe('Actualizar');
  });
});
