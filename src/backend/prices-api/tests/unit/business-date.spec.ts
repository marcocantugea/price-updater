import {
  addBusinessDays,
  businessDateKey,
  dateKeyToStoredDate,
  isBusinessDateWithinRange,
  isDateOnlyValue,
  isValidTimeZone
} from '../../src/common/utils/business-date';

describe('business-date utilities', () => {
  it('validates IANA time-zone identifiers', () => {
    expect(isValidTimeZone('America/Mexico_City')).toBe(true);
    expect(isValidTimeZone('Invalid/Zone')).toBe(false);
  });

  it('resolves the tenant business date immediately around local midnight', () => {
    const beforeMidnight = new Date('2026-09-20T05:59:59.999Z');
    const atMidnight = new Date('2026-09-20T06:00:00.000Z');

    expect(businessDateKey(beforeMidnight, 'America/Mexico_City')).toBe('2026-09-19');
    expect(businessDateKey(atMidnight, 'America/Mexico_City')).toBe('2026-09-20');
  });

  it('keeps one-day ranges inclusive for the complete tenant calendar day', () => {
    const date = dateKeyToStoredDate('2026-09-19');

    expect(isBusinessDateWithinRange(date, date, new Date('2026-09-20T05:59:59.999Z'), 'America/Mexico_City')).toBe(
      true
    );
    expect(isBusinessDateWithinRange(date, date, new Date('2026-09-20T06:00:00.000Z'), 'America/Mexico_City')).toBe(
      false
    );
  });

  it('validates and advances date-only values without machine-local conversion', () => {
    expect(isDateOnlyValue('2026-09-19')).toBe(true);
    expect(isDateOnlyValue('2026-9-19')).toBe(false);
    expect(addBusinessDays('2026-09-19', 1)).toBe('2026-09-20');
  });
});
