import {
  computeCheckDigit,
  expandUpcE,
  IDENTIFIER_TYPES,
  normalizeToGtin14,
  parseIdentifier,
  type IdentifierType
} from '../../src/common/utils/product-identifier';

/**
 * The check digits below are computed with the GS1 rule (rightmost data digit
 * carries weight 3, alternating leftwards) and then asserted, so a regression in
 * the weighting shows up as a concrete failing value rather than as a vague
 * "invalid" result.
 */
describe('product identifier — check digit', () => {
  it('computes the EAN-13 check digit', () => {
    expect(computeCheckDigit('750123456789')).toBe(3);
  });

  it('computes the EAN-8 check digit', () => {
    expect(computeCheckDigit('1234567')).toBe(0);
  });

  it('computes the UPC-A check digit', () => {
    expect(computeCheckDigit('03600029145')).toBe(2);
  });

  it('returns 0 rather than 10 when the weighted sum is already a multiple of 10', () => {
    // sum = 60 -> (10 - 0) % 10 === 0, not 10.
    expect(computeCheckDigit('1234567')).toBe(0);
    expect(computeCheckDigit('0000000')).toBe(0);
  });
});

describe('product identifier — GTIN-14 normalization', () => {
  it('left-pads to exactly 14 digits', () => {
    expect(normalizeToGtin14('12345670')).toBe('00000012345670');
    expect(normalizeToGtin14('7501234567893')).toBe('07501234567893');
    expect(normalizeToGtin14('012300000451')).toBe('00012300000451');
  });

  it('never shortens a value that is already 14 digits', () => {
    expect(normalizeToGtin14('12345678901234')).toBe('12345678901234');
  });
});

describe('product identifier — UPC-E expansion', () => {
  it('expands using the last-digit rule', () => {
    // Body 123450 (last digit 0): manufacturer = "12" + "0" + "00", product =
    // "00" + "345", so the UPC-A is 0 12000 00345 1.
    expect(expandUpcE('01234501')).toBe('012000003451');
  });

  it('expands every rule branch to 12 digits', () => {
    for (const last of ['0', '1', '2', '3', '4', '5', '9']) {
      const expanded = expandUpcE(`012345${last}3`);
      expect(expanded).not.toBeNull();
      expect(expanded).toHaveLength(12);
      expect(expanded!.startsWith('0')).toBe(true);
    }
  });

  it('rejects a body that cannot be a UPC-E', () => {
    expect(expandUpcE('21234531')).toBeNull(); // number system must be 0 or 1
    expect(expandUpcE('0123453')).toBeNull(); // 7 digits
    expect(expandUpcE('0123456a')).toBeNull(); // not all digits
  });

  it('derives the GTIN-14 from the expanded UPC-A, not from the 8 transmitted digits', () => {
    // UPC-E 01234531 expands to UPC-A 012300000451, so its GTIN-14 is
    // 00 + 012300000451. Padding the 8 compressed digits would give
    // 00000001234531, a different article — this assertion is the guard.
    const result = parseIdentifier('upc_e', '01234531');

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.parsed.normalizedValue).toBe('00012300000451');
    expect(result.ok === true && result.parsed.value).toBe('01234531');
  });
});

describe('product identifier — parseIdentifier', () => {
  it('accepts the four symbologies with their exact lengths', () => {
    const valid: Array<[IdentifierType, string, string]> = [
      ['ean_8', '12345670', '00000012345670'],
      ['upc_a', '036000291452', '00036000291452'],
      ['ean_13', '7501234567893', '07501234567893'],
      ['upc_e', '01234531', '00012300000451']
    ];

    for (const [type, value, normalized] of valid) {
      const result = parseIdentifier(type, value);
      expect(result.ok).toBe(true);
      expect(result.ok === true && result.parsed.normalizedValue).toBe(normalized);
      expect(result.ok === true && result.parsed.type).toBe(type);
    }
  });

  it('preserves leading zeroes by keeping the value a string', () => {
    const result = parseIdentifier('upc_a', '036000291452');

    expect(result.ok).toBe(true);
    expect(typeof (result.ok === true && result.parsed.value)).toBe('string');
    expect(result.ok === true && result.parsed.value.startsWith('0')).toBe(true);
  });

  it('reports a checksum failure separately from a format failure', () => {
    // Right length and all digits, but the check digit is wrong.
    const checksum = parseIdentifier('ean_13', '7501234567890');
    expect(checksum.ok).toBe(false);
    expect(checksum.ok === false && checksum.reason).toBe('checksum');

    const upcEChecksum = parseIdentifier('upc_e', '01234530');
    expect(upcEChecksum.ok === false && upcEChecksum.reason).toBe('checksum');
  });

  it('rejects wrong lengths, non-digits, and unknown types as format errors', () => {
    const cases: Array<[IdentifierType, unknown]> = [
      ['ean_13', '750123456789'], // 12 digits
      ['ean_13', '75012345678934'], // 14 digits
      ['ean_8', '1234567'], // 7 digits
      ['upc_a', '0360002914520'], // 13 digits
      ['ean_13', '750123456789A'],
      ['ean_13', ''],
      ['ean_13', '7501234567 93'], // internal whitespace, correct length
      ['nope' as IdentifierType, '12345670']
    ];

    for (const [type, value] of cases) {
      const result = parseIdentifier(type, value);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('format');
    }
  });

  it('trims surrounding whitespace and stores the trimmed digits', () => {
    // Deliberate: a code pasted with a stray space is accepted, but the value
    // that gets persisted (and normalized) is the trimmed one, so the API never
    // stores whitespace in an identifier.
    const result = parseIdentifier('ean_13', ' 7501234567893 ');

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.parsed.value).toBe('7501234567893');
    expect(result.ok === true && result.parsed.normalizedValue).toBe('07501234567893');
  });

  it('rejects non-string input without throwing', () => {
    for (const value of [null, undefined, 7501234567893, {}, ['7501234567893']]) {
      const result = parseIdentifier('ean_13', value);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('format');
    }
  });

  it('exposes exactly the four supported symbologies', () => {
    expect([...IDENTIFIER_TYPES]).toEqual(['ean_8', 'ean_13', 'upc_a', 'upc_e']);
  });
});
