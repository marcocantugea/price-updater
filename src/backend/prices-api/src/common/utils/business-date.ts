import { ValidationError } from '../errors';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates an IANA time-zone identifier using the runtime's ICU data. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new ValidationError('Invalid time zone', [
      { field: 'timeZone', message: `${timeZone} is not a valid IANA time-zone identifier` }
    ]);
  }
}

/** Returns the UTC calendar date represented by a database DATE value. */
export function dateKeyFromStoredDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
    .map((part, index) => (index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0')))
    .join('-');
}

/** Converts a business date to a UTC-midnight Date accepted by Prisma DATE fields. */
export function dateKeyToStoredDate(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) throw new Error(`Invalid date-only value: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (dateKeyFromStoredDate(date) !== value) throw new Error(`Invalid date-only value: ${value}`);
  return date;
}

/** Gets the current calendar date in the tenant's IANA time zone. */
export function businessDateKey(now: Date = new Date(), timeZone = 'UTC'): string {
  assertValidTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function isDateOnlyValue(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  try {
    return dateKeyFromStoredDate(dateKeyToStoredDate(value)) === value;
  } catch {
    return false;
  }
}

/** Adds calendar days without applying a local machine time zone. */
export function addBusinessDays(dateKey: string, days: number): string {
  const date = dateKeyToStoredDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromStoredDate(date)!;
}

export function isBusinessDateWithinRange(
  startDate: Date | string,
  endDate: Date | string | null | undefined,
  now: Date,
  timeZone: string
): boolean {
  const current = businessDateKey(now, timeZone);
  const start = dateKeyFromStoredDate(startDate);
  const end = dateKeyFromStoredDate(endDate);
  return Boolean(start && start <= current && (!end || end >= current));
}
