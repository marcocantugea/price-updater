import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { ApiErrorLocalizerService } from './api-error-localizer.service';
import { LanguageService } from './language.service';
import enUS from './catalogs/en-US.json';

// Expected values come from the shipped catalog, so these assertions cannot drift.
const ERRORS = (enUS as { errors: Record<string, string> }).errors;
const UNEXPECTED = ERRORS['unexpected'];

/** Mirrors Transloco's interpolation for the catalog templates. */
function interpolate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, value),
    template
  );
}

/** Mirrors the API error envelope. */
function envelope(overrides: Record<string, unknown> = {}): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 422,
    error: {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      ...overrides
    }
  });
}

describe('ApiErrorLocalizerService', () => {
  let service: ApiErrorLocalizerService;
  let language: LanguageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    language = TestBed.inject(LanguageService);
    service = TestBed.inject(ApiErrorLocalizerService);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('localizes a known top-level code instead of showing the API prose', () => {
    language.applyUserLocale('en-US');

    expect(service.message(envelope({ code: 'TENANT_REQUIRED', message: 'A tenant context is required' }))).toBe(
      'Select a company to continue.'
    );
  });

  it('follows a runtime language switch', () => {
    const error = envelope({ code: 'TENANT_REQUIRED' });

    language.applyUserLocale('en-US');
    expect(service.message(error)).toBe('Select a company to continue.');

    language.applyUserLocale('es-419');
    expect(service.message(error)).toBe('Selecciona una empresa para continuar.');
  });

  it('falls back to the API message when the code is unknown', () => {
    expect(service.message(envelope({ code: 'SOME_NEW_CODE', message: 'Something specific happened' }))).toBe(
      'Something specific happened'
    );
  });

  it('falls back to the localized unexpected error when there is no usable message', () => {
    language.applyUserLocale('en-US');

    expect(service.message(envelope({ code: 'SOME_NEW_CODE', message: '' }))).toBe(UNEXPECTED);
    expect(service.message(envelope({ code: 'SOME_NEW_CODE', message: '   ' }))).toBe(UNEXPECTED);
    expect(service.message({})).toBe(UNEXPECTED);
    expect(service.message(null)).toBe(UNEXPECTED);
  });

  it('never shows internals even when the API sends them', () => {
    language.applyUserLocale('en-US');

    const unsafe = [
      'PrismaClientKnownRequestError: Unique constraint failed',
      'connect ECONNREFUSED 127.0.0.1:3306',
      '    at Object.<anonymous> (/app/dist/server.js:10:15)',
      'x'.repeat(400)
    ];

    for (const message of unsafe) {
      expect(service.message(envelope({ code: 'UNKNOWN_CODE', message }))).toBe(UNEXPECTED);
    }
  });

  it('accepts a plain Error message from our own code', () => {
    expect(service.message(new Error('Local failure'))).toBe('Local failure');
  });

  it('localizes a field detail by its stable code, with parameters', () => {
    language.applyUserLocale('en-US');

    const error = envelope({
      details: [
        { field: 'preferredLocale', code: 'UNSUPPORTED_LOCALE', message: 'must be one of: es-419, en-US', params: { allowed: ['es-419', 'en-US'] } }
      ]
    });

    expect(service.fieldErrors(error)).toEqual({
      preferredLocale: 'Unsupported language. Valid options: es-419, en-US.'
    });
  });

  it('interpolates numeric parameters', () => {
    language.applyUserLocale('en-US');

    const error = envelope({
      details: [{ field: 'password', code: 'TOO_SMALL', message: 'too short', params: { minimum: 8 } }]
    });

    expect(service.fieldErrors(error)).toEqual({ password: interpolate(ERRORS['TOO_SMALL'], { minimum: '8' }) });
  });

  it('falls back to the detail message when its code is unknown', () => {
    const error = envelope({
      details: [{ field: 'name', code: 'BRAND_NEW_CODE', message: 'Name is already used' }]
    });

    expect(service.fieldErrors(error)).toEqual({ name: 'Name is already used' });
  });

  it('rejects an unsafe detail message', () => {
    const error = envelope({
      details: [{ field: 'name', message: 'PrismaClientKnownRequestError' }]
    });

    expect(service.fieldErrors(error)['name']).not.toContain('Prisma');
  });

  it('keeps the field so Reactive Forms can bind the error', () => {
    const error = envelope({
      details: [
        { field: 'email', code: 'EMAIL_ALREADY_EXISTS', message: 'exists' },
        { field: 'status', message: 'bad status' }
      ]
    });

    const errors = service.fieldErrors(error);
    expect(Object.keys(errors)).toEqual(['email', 'status']);
    // The first message per field wins.
    expect(errors['email']).toBeDefined();
  });

  it('ignores details without a field and tolerates a missing detail list', () => {
    expect(service.fieldErrors(envelope({ details: [{ message: 'no field' }] }))).toEqual({});
    expect(service.fieldErrors(envelope({ details: undefined }))).toEqual({});
    expect(service.fieldErrors({})).toEqual({});
  });

  it('localizes a single detail and tolerates a missing one', () => {
    language.applyUserLocale('en-US');

    expect(service.detail({ field: 'x', code: 'TENANT_REQUIRED', message: 'nope' })).toBe(
      'Select a company to continue.'
    );
    expect(service.detail(null)).toBe(UNEXPECTED);
  });

  it('honours a custom fallback key with parameters', () => {
    language.applyUserLocale('en-US');

    expect(
      service.message(new HttpErrorResponse({ status: 0, error: null }), {
        fallbackKey: 'language.saveFailed',
        params: { language: 'Español (Latinoamérica)' }
      })
    ).toBe('The language could not be saved. Español (Latinoamérica) was restored.');
  });

  it('ignores non-scalar parameters instead of rendering raw placeholders', () => {
    language.applyUserLocale('en-US');

    const error = envelope({
      details: [{ field: 'x', code: 'UNSUPPORTED_LOCALE', message: 'nope', params: { allowed: { a: 1 } } }]
    });

    expect(service.fieldErrors(error)['x']).not.toContain('{{');
  });
});
