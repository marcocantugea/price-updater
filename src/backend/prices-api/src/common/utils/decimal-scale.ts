/**
 * Decimal scale of a stored value, as a count of significant fraction digits.
 *
 * String-based on purpose. The rule this backs up — "a unit may not be tightened
 * below the values already captured in it" — must not depend on binary rounding:
 * `value * 10 ** n === Math.round(...)` is exactly the kind of floating-point
 * comparison that reports the wrong scale for values such as `0.1` or `1.15`.
 *
 * Trailing zeroes do not count. A `DECIMAL(12,3)` column returns `1.250` for a
 * value of one and a quarter, and that value is perfectly representable by a
 * unit that allows two decimals.
 *
 * Prisma hands `DECIMAL` columns over as `Decimal` instances, which expose
 * `toFixed()` without exponent notation; plain numbers (the in-memory fake used
 * by unit tests, and `Number` inputs) fall back to their shortest decimal
 * representation, scientific notation included.
 */
export function decimalPlacesOf(value: unknown): number {
  const text = decimalTextOf(value);
  if (text === '') return 0;

  const exponentIndex = text.search(/[eE]/);

  if (exponentIndex >= 0) {
    const mantissa = text.slice(0, exponentIndex);
    const exponent = Number(text.slice(exponentIndex + 1));
    if (Number.isNaN(exponent)) return significantFraction(mantissa).length;
    return Math.max(0, significantFraction(mantissa).length - exponent);
  }

  return significantFraction(text).length;
}

function decimalTextOf(value: unknown): string {
  if (value === null || value === undefined) return '';

  const candidate = value as { toFixed?: (digits?: number) => string };
  const text =
    typeof value !== 'number' && typeof candidate?.toFixed === 'function'
      ? candidate.toFixed()
      : String(value);

  const trimmed = text.trim();
  // Non-finite values carry no scale; treating them as 0 keeps the caller's
  // comparison meaningful instead of throwing on an administrative edit.
  return trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity' ? '' : trimmed;
}

/** Fraction digits without the trailing zeroes: `1.250` -> `25`. */
function significantFraction(text: string): string {
  const dot = text.indexOf('.');
  if (dot < 0) return '';
  return text.slice(dot + 1).replace(/0+$/, '');
}
