import { TestBed } from '@angular/core/testing';
import { StatusLabelPipe } from './status-label.pipe';
import { MoneyPipe } from './money.pipe';
import { AppDatePipe } from './app-date.pipe';
import { LanguageService } from '../i18n/language.service';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';

describe('pipes', () => {
  let language: LanguageService;

  /**
   * The pipes are impure and inject services, so they are built inside an
   * injection context.
   */
  function build<T>(type: new () => T): T {
    return TestBed.runInInjectionContext(() => new type());
  }

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    language = TestBed.inject(LanguageService);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('StatusLabelPipe', () => {
    it('translates known status codes', () => {
      const pipe = build(StatusLabelPipe);

      expect(pipe.transform('active')).toBe('Activo');
      expect(pipe.transform('inactive')).toBe('Inactivo');
      expect(pipe.transform('revoked')).toBe('Revocado');
      expect(pipe.transform('expired')).toBe('Expirado');
      expect(pipe.transform('api_key')).toBe('API key');
    });

    it('follows a runtime language switch', () => {
      const pipe = build(StatusLabelPipe);

      expect(pipe.transform('active')).toBe('Activo');

      language.setLocale('en-US');

      expect(pipe.transform('active')).toBe('Active');
      expect(pipe.transform('revoked')).toBe('Revoked');
    });

    it('passes unknown codes through and handles empties', () => {
      const pipe = build(StatusLabelPipe);

      // A backend status with no catalog entry stays visible instead of blanking.
      expect(pipe.transform('custom_state')).toBe('custom_state');
      expect(pipe.transform('')).toBe('—');
      expect(pipe.transform(null)).toBe('—');
      expect(pipe.transform(undefined)).toBe('—');
    });
  });

  describe('MoneyPipe', () => {
    it('formats an amount with the given currency', () => {
      const pipe = build(MoneyPipe);
      expect(pipe.transform(1234.5, 'MXN')).toContain('1,234.50');
    });

    it('changes the format with the active locale', () => {
      const pipe = build(MoneyPipe);

      language.setLocale('es-419');
      const spanish = pipe.transform(1234.5, 'MXN');

      language.setLocale('en-US');
      const english = pipe.transform(1234.5, 'MXN');

      expect(spanish).toBe(new Intl.NumberFormat('es-419', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5));
      expect(english).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5));
      expect(spanish).not.toBe(english);
    });

    it('returns an em dash for empty values', () => {
      const pipe = build(MoneyPipe);

      expect(pipe.transform(null)).toBe('—');
      expect(pipe.transform(undefined)).toBe('—');
      expect(pipe.transform('')).toBe('—');
      expect(pipe.transform(Number.NaN)).toBe('—');
    });

    it('accepts numeric strings', () => {
      const pipe = build(MoneyPipe);
      expect(pipe.transform('100', 'MXN')).toContain('100.00');
    });

    it('falls back when the currency code is invalid', () => {
      const pipe = build(MoneyPipe);
      expect(pipe.transform(10, 'NOT-A-CURRENCY')).toContain('10.00');
    });
  });

  describe('AppDatePipe', () => {
    it('formats an ISO date', () => {
      const pipe = build(AppDatePipe);
      const formatted = pipe.transform('2024-03-15T10:30:00.000Z');

      expect(formatted).toMatch(/2024/);
      expect(formatted).not.toBe('—');
    });

    it('changes the month name with the active locale', () => {
      const pipe = build(AppDatePipe);
      const instant = '2024-03-15T10:30:00.000Z';

      language.setLocale('es-419');
      const spanish = pipe.transform(instant);

      language.setLocale('en-US');
      const english = pipe.transform(instant);

      expect(spanish).toBe(
        new Intl.DateTimeFormat('es-419', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(instant))
      );
      expect(english).toBe(
        new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(instant))
      );
    });

    it('supports including the time', () => {
      const pipe = build(AppDatePipe);
      const withTime = pipe.transform('2024-03-15T10:30:00.000Z', true);

      expect(withTime.length).toBeGreaterThan(pipe.transform('2024-03-15T10:30:00.000Z').length);
    });

    it('preserves a database calendar date instead of shifting it to the browser zone', () => {
      const pipe = build(AppDatePipe);
      const formatted = pipe.transform('2026-09-20T00:00:00.000Z', false, true);

      expect(formatted).toContain('20');
      expect(formatted).toContain('2026');
      expect(formatted).toBe(
        new Intl.DateTimeFormat(language.activeLocale(), {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          timeZone: 'UTC'
        }).format(new Date('2026-09-20T00:00:00.000Z'))
      );
    });

    it('returns an em dash for empty or invalid values', () => {
      const pipe = build(AppDatePipe);

      expect(pipe.transform(null)).toBe('—');
      expect(pipe.transform('')).toBe('—');
      expect(pipe.transform('not-a-date')).toBe('—');
    });
  });
});
