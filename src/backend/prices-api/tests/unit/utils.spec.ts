import { Prisma } from '@prisma/client';
import {
  PHASE_ONE_SCOPES,
  effectiveApiKeyStatus,
  extractApiKeyHeader,
  generateApiKey,
  hasScope,
  hashApiKey,
  isApiKeyUsable,
  normalizeScopes
} from '../../src/common/utils/api-key';
import { hashPassword, verifyPassword } from '../../src/common/utils/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry
} from '../../src/common/utils/tokens';
import { auditCreateFields, auditDeleteFields, auditUpdateFields } from '../../src/common/utils/audit';
import { decimalPlacesOf } from '../../src/common/utils/decimal-scale';
import {
  buildPaginationMeta,
  parseListQuery,
  toSkipTake
} from '../../src/common/utils/pagination';
import { toPlain } from '../../src/common/utils/serialize';
import {
  clearRefreshCookie,
  readRefreshCookie,
  refreshCookieOptions,
  setRefreshCookie
} from '../../src/common/utils/cookies';

describe('api key utilities', () => {
  it('generates a prefixed key and stores only a hash', () => {
    const { plaintext, prefix } = generateApiKey();

    expect(plaintext.startsWith('pg_')).toBe(true);
    expect(prefix).toBe(plaintext.slice(0, 11));

    const hash = hashApiKey(plaintext);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(plaintext);
  });

  it('generates unique keys', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });

  it('derives the effective status: active, revoked and expired', () => {
    const now = new Date('2024-06-15T00:00:00.000Z');

    expect(effectiveApiKeyStatus({ status: 'active' }, now)).toBe('active');
    expect(effectiveApiKeyStatus({ status: 'revoked' }, now)).toBe('revoked');
    expect(effectiveApiKeyStatus({ status: 'active', revokedAt: new Date('2024-01-01') }, now)).toBe('revoked');
    expect(effectiveApiKeyStatus({ status: 'active', expiresAt: new Date('2024-01-01') }, now)).toBe('expired');
    expect(effectiveApiKeyStatus({ status: 'active', expiresAt: new Date('2099-01-01') }, now)).toBe('active');
  });

  it('reports usability from the derived status', () => {
    const now = new Date('2024-06-15T00:00:00.000Z');
    expect(isApiKeyUsable({ status: 'active' }, now)).toBe(true);
    expect(isApiKeyUsable({ status: 'active', expiresAt: new Date('2000-01-01') }, now)).toBe(false);
    expect(isApiKeyUsable({ status: 'revoked' }, now)).toBe(false);
  });

  it('extracts the API key header defensively', () => {
    expect(extractApiKeyHeader('  pg_abc  ')).toBe('pg_abc');
    expect(extractApiKeyHeader('')).toBeNull();
    expect(extractApiKeyHeader(undefined)).toBeNull();
    expect(extractApiKeyHeader(123)).toBeNull();
  });

  it('normalizes scopes and checks membership', () => {
    expect(normalizeScopes(['a', 'b'])).toEqual(['a', 'b']);
    expect(normalizeScopes('a')).toEqual([]);
    expect(normalizeScopes(null)).toEqual([]);
    expect(hasScope(['a'], 'a')).toBe(true);
    expect(hasScope(['a'], 'b')).toBe(false);
  });

  it('exposes only the read-only phase 1 scopes', () => {
    expect([...PHASE_ONE_SCOPES]).toEqual([
      'products:read',
      'prices:read',
      'price-lists:read',
      'marketplaces:read'
    ]);
    expect(PHASE_ONE_SCOPES.every((scope) => scope.endsWith(':read'))).toBe(true);
  });
});

describe('password utilities', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('ChangeMe!123');
    expect(hash).not.toBe('ChangeMe!123');
    await expect(verifyPassword('ChangeMe!123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('returns false for empty input instead of throwing', async () => {
    await expect(verifyPassword('', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('token utilities', () => {
  it('generates opaque refresh tokens and hashes them deterministically', () => {
    const token = generateRefreshToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it('computes the refresh expiry from the configured TTL', () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const expiry = refreshTokenExpiry(now);
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('audit helpers', () => {
  it('fills creator and updater columns', () => {
    const actor = { id: 'user-1', type: 'user' as const };
    expect(auditCreateFields(actor)).toEqual({
      createdBy: 'user-1',
      createdByType: 'user',
      updatedBy: 'user-1',
      updatedByType: 'user'
    });
    expect(auditUpdateFields(actor)).toEqual({ updatedBy: 'user-1', updatedByType: 'user' });
  });

  it('records the api_key actor type', () => {
    const actor = { id: 'key-1', type: 'api_key' as const };
    expect(auditCreateFields(actor).createdByType).toBe('api_key');
  });

  it('marks the deletion timestamp and deactivates', () => {
    const fields = auditDeleteFields({ id: null, type: 'system' });
    expect(fields.deletedAt).toBeInstanceOf(Date);
    expect(fields.updatedByType).toBe('system');
  });
});

describe('pagination helpers', () => {
  it('applies defaults', () => {
    const query = parseListQuery({});
    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
    expect(query.order).toBe('desc');
  });

  it('clamps the limit and normalizes the page', () => {
    expect(parseListQuery({ page: '-5', limit: '5000' }).page).toBe(1);
    expect(parseListQuery({ limit: '5000' }).limit).toBe(100);
    expect(parseListQuery({ limit: '0' }).limit).toBe(20);
  });

  it('reads the sort direction', () => {
    expect(parseListQuery({ order: 'ASC' }).order).toBe('asc');
    expect(parseListQuery({ order: 'nonsense' }).order).toBe('desc');
  });

  it('trims search/status/sort and drops blanks', () => {
    const query = parseListQuery({ search: '  tv  ', status: '  ', sort: 'name' });
    expect(query.search).toBe('tv');
    expect(query.status).toBeUndefined();
    expect(query.sort).toBe('name');
  });

  it('builds pagination metadata', () => {
    expect(buildPaginationMeta(2, 10, 35)).toEqual({ page: 2, limit: 10, total: 35, totalPages: 4 });
    expect(buildPaginationMeta(1, 0, 0).totalPages).toBe(0);
  });

  it('derives skip/take', () => {
    expect(toSkipTake(parseListQuery({ page: '3', limit: '10' }))).toEqual({ skip: 20, take: 10 });
  });
});

describe('serialize helper', () => {
  it('converts Prisma Decimal to number and Date to ISO', () => {
    const value = toPlain({
      price: new Prisma.Decimal('12.34'),
      when: new Date('2024-01-01T00:00:00.000Z'),
      nested: { list: [new Prisma.Decimal('1.5')] }
    });

    expect(value).toEqual({
      price: 12.34,
      when: '2024-01-01T00:00:00.000Z',
      nested: { list: [1.5] }
    });
  });

  it('passes through null, scalars and arrays', () => {
    expect(toPlain(null)).toBeNull();
    expect(toPlain(5)).toBe(5);
    expect(toPlain([1, 2])).toEqual([1, 2]);
  });

  it('serializes a product cost as a JSON number and keeps NULL as null', () => {
    // The double used by the CRUD specs stores raw fixture values, so the
    // Decimal -> number contract is asserted here, against a real Decimal.
    const known = toPlain<Record<string, unknown>>({
      id: 'product-id',
      sku: 'SKU-001',
      basePrice: new Prisma.Decimal('150.00'),
      cost: new Prisma.Decimal('90.00'),
      currencyCode: 'MXN'
    });

    expect(known.cost).toBe(90);
    expect(typeof known.cost).toBe('number');
    expect(known.basePrice).toBe(150);

    const unknown = toPlain<Record<string, unknown>>({
      id: 'product-id',
      sku: 'SKU-002',
      basePrice: new Prisma.Decimal('200.00'),
      cost: null,
      currencyCode: 'MXN'
    });

    // NULL survives as JSON null and is never substituted with zero.
    expect(unknown.cost).toBeNull();
    expect(unknown.cost).not.toBe(0);
  });

  it('round-trips monetary amounts exactly through Decimal and JSON', () => {
    for (const amount of ['0.00', '0.07', '0.29', '95.55', '9999999999.99']) {
      const asNumber = new Prisma.Decimal(amount).toNumber();
      const parsed = JSON.parse(JSON.stringify({ cost: asNumber })).cost as number;

      expect(Object.is(asNumber, parsed)).toBe(true);
    }
  });
});

describe('cookie helpers', () => {
  function mockResponse() {
    const res: any = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  }

  it('sets an HttpOnly refresh cookie', () => {
    const res = mockResponse();
    setRefreshCookie(res, 'token-value', new Date('2024-01-02'));

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = res.cookie.mock.calls[0];
    expect(name).toBe('pg_refresh_token');
    expect(value).toBe('token-value');
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/api/v1/auth');
  });

  it('clears the refresh cookie with the same options', () => {
    const res = mockResponse();
    clearRefreshCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith('pg_refresh_token', expect.objectContaining({ httpOnly: true }));
  });

  it('reads the refresh cookie', () => {
    expect(readRefreshCookie({ cookies: { pg_refresh_token: 'abc' } } as any)).toBe('abc');
    expect(readRefreshCookie({ cookies: {} } as any)).toBeNull();
    expect(readRefreshCookie({} as any)).toBeNull();
  });

  it('builds cookie options with sameSite and secure flags', () => {
    const options = refreshCookieOptions(new Date('2024-01-02'));
    expect(options.sameSite).toBeDefined();
    expect(typeof options.secure).toBe('boolean');
  });
});

describe('decimal scale helper', () => {
  it('counts the significant fraction digits of a Prisma Decimal', () => {
    // The trailing zero of a DECIMAL(12,3) column does not consume scale: a
    // value of one and a quarter is representable by a 2-decimal unit.
    expect(decimalPlacesOf(new Prisma.Decimal('1.250'))).toBe(2);
    expect(decimalPlacesOf(new Prisma.Decimal('1.25'))).toBe(2);
    expect(decimalPlacesOf(new Prisma.Decimal('1.2'))).toBe(1);
    expect(decimalPlacesOf(new Prisma.Decimal('12'))).toBe(0);
    expect(decimalPlacesOf(new Prisma.Decimal('0.000'))).toBe(0);
  });

  it('handles plain numbers without floating-point drift', () => {
    expect(decimalPlacesOf(1.25)).toBe(2);
    expect(decimalPlacesOf(0.1)).toBe(1);
    expect(decimalPlacesOf(1.15)).toBe(2);
    expect(decimalPlacesOf(2)).toBe(0);
    // Scientific notation is normalized instead of being read as zero scale.
    expect(decimalPlacesOf(1e-7)).toBe(7);
  });

  it('handles strings and empty values', () => {
    expect(decimalPlacesOf('1.250')).toBe(2);
    expect(decimalPlacesOf('-1.25')).toBe(2);
    expect(decimalPlacesOf(null)).toBe(0);
    expect(decimalPlacesOf(undefined)).toBe(0);
    expect(decimalPlacesOf('')).toBe(0);
    expect(decimalPlacesOf(Number.NaN)).toBe(0);
  });
});
