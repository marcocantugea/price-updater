import { TestBed } from '@angular/core/testing';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { LanguageService } from './language.service';
import { LocaleFormattingService } from './locale-formatting.service';

describe('LocaleFormattingService', () => {
  let service: LocaleFormattingService;
  let language: LanguageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    language = TestBed.inject(LanguageService);
    service = TestBed.inject(LocaleFormattingService);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('dates', () => {
    const instant = new Date('2026-09-20T18:30:00.000Z');

    it('uses the active locale for the month name', () => {
      language.applyUserLocale('es-419');
      const spanish = service.formatDate(instant);

      language.applyUserLocale('en-US');
      const english = service.formatDate(instant);

      expect(spanish).not.toBe(english);
      // Compared against Intl called with the expected locale so the assertion
      // does not depend on punctuation that can vary by runtime.
      expect(spanish).toBe(
        new Intl.DateTimeFormat('es-419', { year: 'numeric', month: 'short', day: '2-digit' }).format(instant)
      );
      expect(english).toBe(
        new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(instant)
      );
    });

    it('includes the time only when asked', () => {
      language.applyUserLocale('en-US');
      const dateOnly = service.formatDate(instant);
      const withTime = service.formatDate(instant, { withTime: true });

      expect(withTime).not.toBe(dateOnly);
      expect(withTime).toContain(':');
    });

    it('formats a database calendar date with UTC components', () => {
      language.applyUserLocale('en-US');

      expect(service.formatDate('2026-09-20T00:00:00.000Z', { dateOnly: true })).toBe(
        new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          timeZone: 'UTC'
        }).format(new Date('2026-09-20T00:00:00.000Z'))
      );
    });

    it('renders an em dash for empty or invalid values', () => {
      for (const value of [null, undefined, '', 'not-a-date']) {
        expect(service.formatDate(value)).toBe('—');
      }
    });

    it('formats a time with the active locale', () => {
      language.applyUserLocale('en-US');
      const formatted = service.formatTime(instant);

      expect(formatted).toContain(':');
      expect(formatted).toBe(
        new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(instant)
      );
    });

    it('renders date and time in an explicit time zone (the tenant clock)', () => {
      language.applyUserLocale('es-419');

      // The tenant time zone is an independent setting from the locale: the
      // clock must show the company's calendar, in the user's language.
      const options = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' } as const;
      expect(service.formatDate(instant, options)).toBe(
        new Intl.DateTimeFormat('es-419', options).format(instant)
      );

      // Switching language changes the wording but not the instant shown.
      language.applyUserLocale('en-US');
      expect(service.formatDate(instant, options)).toBe(
        new Intl.DateTimeFormat('en-US', options).format(instant)
      );

      // And switching time zone changes the instant but not the language.
      const utc = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' } as const;
      expect(service.formatDate(instant, utc)).toBe(new Intl.DateTimeFormat('en-US', utc).format(instant));
      expect(service.formatDate(instant, utc)).not.toBe(service.formatDate(instant, options));
    });

    it('still renders a calendar DATE in UTC even when a zone is given', () => {
      language.applyUserLocale('en-US');

      // `dateOnly` wins: a stored DATE must not shift a day.
      expect(
        service.formatDate('2026-09-20T00:00:00.000Z', { dateOnly: true, timeZone: 'Pacific/Kiritimati' })
      ).toBe(
        new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          timeZone: 'UTC'
        }).format(new Date('2026-09-20T00:00:00.000Z'))
      );
    });
  });

  describe('money', () => {
    it('changes the separators with the locale but preserves the currency', () => {
      language.applyUserLocale('es-419');
      const spanish = service.formatMoney(1234.5, 'MXN');

      language.applyUserLocale('en-US');
      const english = service.formatMoney(1234.5, 'MXN');

      expect(spanish).not.toBe(english);
      expect(spanish).toBe(
        new Intl.NumberFormat('es-419', {
          style: 'currency',
          currency: 'MXN',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(1234.5)
      );
      expect(english).toBe(
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'MXN',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(1234.5)
      );
    });

    it('keeps USD distinct from MXN', () => {
      language.applyUserLocale('en-US');

      expect(service.formatMoney(10, 'USD')).not.toBe(service.formatMoney(10, 'MXN'));
    });

    it('defaults to MXN and accepts numeric strings', () => {
      language.applyUserLocale('es-419');
      expect(service.formatMoney('100')).toBe(service.formatMoney(100, 'MXN'));
    });

    it('falls back to a plain amount for an unknown currency code', () => {
      language.applyUserLocale('en-US');
      expect(service.formatMoney(10, 'NOT-A-CURRENCY')).toBe('10.00 NOT-A-CURRENCY');
    });

    it('renders an em dash for empty or invalid values', () => {
      for (const value of [null, undefined, '', 'abc', Number.NaN]) {
        expect(service.formatMoney(value)).toBe('—');
      }
    });
  });

  describe('numbers', () => {
    it('uses the active locale for formatting', () => {
      language.applyUserLocale('es-419');
      expect(service.formatNumber(1234567.89)).toBe(new Intl.NumberFormat('es-419').format(1234567.89));

      language.applyUserLocale('en-US');
      expect(service.formatNumber(1234567.89)).toBe(new Intl.NumberFormat('en-US').format(1234567.89));
    });

    it('honours explicit options such as a fixed precision', () => {
      language.applyUserLocale('en-US');

      expect(service.formatNumber(12.5, { style: 'percent', maximumFractionDigits: 0 })).toBe(
        new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(12.5)
      );
    });

    it('renders an em dash for empty or invalid values', () => {
      for (const value of [null, undefined, '', 'abc']) {
        expect(service.formatNumber(value)).toBe('—');
      }
    });
  });

  describe('Intl.DisplayNames', () => {
    it('resolves a localized currency name when supported', () => {
      language.applyUserLocale('en-US');
      const name = service.displayName('MXN', 'currency');

      // ChromeHeadless supports it; if a runtime does not, null is allowed.
      if (name !== null) {
        const expected = new Intl.DisplayNames(['en-US'], { type: 'currency' }).of('MXN') ?? '';
        expect(name).toBe(expected);
      }
    });

    it('returns null when the runtime has no DisplayNames support', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames');
      try {
        Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true });
        expect(service.displayName('MXN', 'currency')).toBeNull();
      } finally {
        if (descriptor) Object.defineProperty(Intl, 'DisplayNames', descriptor);
      }
    });

    it('returns null for empty or unknown codes', () => {
      expect(service.displayName('', 'currency')).toBeNull();
      expect(service.displayName(null, 'currency')).toBeNull();
      expect(service.displayName('NOT-A-CODE', 'currency')).toBeNull();
    });
  });

  it('exposes the active locale', () => {
    language.applyUserLocale('en-US');
    expect(service.locale).toBe('en-US');

    language.applyUserLocale('es-419');
    expect(service.locale).toBe('es-419');
  });
});
