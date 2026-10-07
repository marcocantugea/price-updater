/**
 * EAN/UPC handling for product identifiers.
 *
 * Two rules shape this module:
 *
 * 1. `value` is always handled as a **string**, never a number, so leading
 *    zeroes survive (`0012345678905` is a real UPC-A).
 * 2. `normalizedValue` is the **GTIN-14** form: the value left-padded with
 *    zeroes to exactly 14 digits. Uniqueness is enforced on the normalized form,
 *    so two symbologies that denote the same article collide instead of being
 *    stored twice — the whole point of normalizing.
 *
 * GTIN-14 padding per symbology (GS1):
 *
 * | Input   | digits | GTIN-14                     |
 * | ------- | -----: | --------------------------- |
 * | EAN-8   |      8 | `000000` + value            |
 * | UPC-E   |      8 | `00` + its expanded UPC-A   |
 * | UPC-A   |     12 | `00` + value                |
 * | EAN-13  |     13 | `0` + value                 |
 *
 * UPC-E is the trap: it is transmitted as 8 digits, but its GTIN-14 is derived
 * from the 12-digit UPC-A it compresses, **not** from the 8 transmitted digits.
 * Padding the compressed form would produce a different number and silently
 * break equivalence detection, so the expansion below is required, not optional.
 */

export type IdentifierType = 'ean_8' | 'ean_13' | 'upc_a' | 'upc_e';

export const IDENTIFIER_TYPES: readonly IdentifierType[] = ['ean_8', 'ean_13', 'upc_a', 'upc_e'];

interface Symbology {
  /** Total digits including the check digit. */
  totalLength: number;
}

const SYMBOLOGIES: Record<IdentifierType, Symbology> = {
  ean_8: { totalLength: 8 },
  ean_13: { totalLength: 13 },
  upc_a: { totalLength: 12 },
  upc_e: { totalLength: 8 }
};

/** Why an identifier was rejected. The API maps these to its error contract. */
export type IdentifierFailure = 'format' | 'checksum';

export interface ParsedIdentifier {
  type: IdentifierType;
  /** Digits exactly as supplied, check digit included. */
  value: string;
  /** GTIN-14 form used for the tenant-wide unique constraint. */
  normalizedValue: string;
}

export type IdentifierResult =
  | { ok: true; parsed: ParsedIdentifier }
  | { ok: false; reason: IdentifierFailure };

/**
 * GS1 check digit for a string of data digits (the check digit excluded).
 *
 * Weights alternate 3/1 so that the **rightmost** data digit always carries
 * weight 3, whatever the length. That single rule covers EAN-8, UPC-A, EAN-13,
 * and the expanded UPC-A of UPC-E, so no per-symbology weight table is needed.
 */
export function computeCheckDigit(dataDigits: string): number {
  let sum = 0;

  for (let i = 0; i < dataDigits.length; i += 1) {
    const digit = dataDigits.charCodeAt(i) - 48;
    const weight = (dataDigits.length - i) % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }

  return (10 - (sum % 10)) % 10;
}

/** Left-pads to exactly 14 digits. Assumes the input is already digits only. */
export function normalizeToGtin14(digits: string): string {
  return digits.padStart(14, '0');
}

/**
 * Expands an 8-digit UPC-E to its 12-digit UPC-A equivalent.
 *
 * Returns `null` when the value cannot be a UPC-E (wrong length or a number
 * system other than 0/1). The last digit of the 6-digit body selects the
 * expansion rule, which is why this cannot be a plain padding operation.
 */
export function expandUpcE(value: string): string | null {
  if (value.length !== 8 || !/^\d{8}$/.test(value)) return null;

  const numberSystem = value[0];
  if (numberSystem !== '0' && numberSystem !== '1') return null;

  const body = value.slice(1, 7);
  const checkDigit = value[7];
  const last = body[5];

  let manufacturer: string;
  let product: string;

  if (last === '0' || last === '1' || last === '2') {
    manufacturer = `${body.slice(0, 2)}${last}00`;
    product = `00${body.slice(2, 5)}`;
  } else if (last === '3') {
    manufacturer = `${body.slice(0, 3)}00`;
    product = `000${body.slice(3, 5)}`;
  } else if (last === '4') {
    manufacturer = `${body.slice(0, 4)}0`;
    product = `0000${body.slice(4, 5)}`;
  } else {
    manufacturer = body.slice(0, 5);
    product = `0000${last}`;
  }

  return `${numberSystem}${manufacturer}${product}${checkDigit}`;
}

/**
 * Validates one identifier and returns its normalized GTIN-14.
 *
 * A rejection is `format` (not digits, or the wrong length for the type) or
 * `checksum` (the check digit does not match). The caller turns `checksum` into
 * `INVALID_IDENTIFIER_CHECKSUM`; `format` stays a generic validation error.
 */
export function parseIdentifier(type: IdentifierType, rawValue: unknown): IdentifierResult {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  const symbology = SYMBOLOGIES[type];

  if (!symbology) return { ok: false, reason: 'format' };
  if (!/^\d+$/.test(value) || value.length !== symbology.totalLength) {
    return { ok: false, reason: 'format' };
  }

  // UPC-E's check digit belongs to the expanded UPC-A, so both the validation
  // and the GTIN-14 below work from the expansion.
  const expanded = type === 'upc_e' ? expandUpcE(value) : value;
  if (!expanded) return { ok: false, reason: 'format' };

  const dataDigits = expanded.slice(0, expanded.length - 1);
  const checkDigit = Number(expanded[expanded.length - 1]);

  if (computeCheckDigit(dataDigits) !== checkDigit) {
    return { ok: false, reason: 'checksum' };
  }

  return {
    ok: true,
    parsed: { type, value, normalizedValue: normalizeToGtin14(expanded) }
  };
}
