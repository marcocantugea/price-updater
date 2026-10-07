import { z } from 'zod';
import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/common/errors';
import { requestId } from '../../src/middlewares/request-id';
import { localizedIssue, validate, zodDetails } from '../../src/middlewares/validate';
import { errorHandler, notFoundHandler } from '../../src/middlewares/error-handler';
import {
  createJwtAuthMiddleware,
  extractBearerToken,
  requireGlobalAdmin,
  requirePermission
} from '../../src/middlewares/auth';
import { createApiKeyAuthMiddleware, requireScope } from '../../src/middlewares/api-key';
import { requireTenantContext, resolveTenant } from '../../src/middlewares/tenant';
import { mockRequest, mockResponse, runHandler } from '../helpers/http';
import type { AuthUser } from '../../src/types';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['products:read'],
    preferredLocale: 'es-419',
    ...overrides
  };
}

describe('request-id middleware', () => {
  it('creates a correlation id and echoes it in the response', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    requestId(req, res, next);

    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(10);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('honours an incoming x-request-id', () => {
    const req = mockRequest({ headers: { 'x-request-id': 'trace-123' } });
    requestId(req, mockResponse(), jest.fn());
    expect(req.requestId).toBe('trace-123');
  });
});

describe('validate middleware', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('replaces the body with the parsed value', async () => {
    const req = mockRequest({ body: { name: 'ok', extra: 'kept' } });
    const error = await runHandler(validate(schema), req, mockResponse());

    expect(error).toBeUndefined();
    expect(req.body.name).toBe('ok');
  });

  it('rejects invalid payloads with a ValidationError carrying field details', async () => {
    const req = mockRequest({ body: { name: '' } });
    const error = await runHandler(validate(schema), req, mockResponse());

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details?.[0].field).toBe('name');
  });

  it('validates query parameters into validatedQuery', async () => {
    const req = mockRequest({ query: { page: '2' } });
    const error = await runHandler(validate(z.object({ page: z.coerce.number() }), 'query'), req, mockResponse());

    expect(error).toBeUndefined();
    expect((req as any).validatedQuery).toEqual({ page: 2 });
  });
});

describe('localizable validation details', () => {
  it('exposes a stable code and parameters for a bound violation', () => {
    const parsed = z.object({ name: z.string().min(3) }).safeParse({ name: 'ab' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const [detail] = zodDetails(parsed.error);
    expect(detail).toMatchObject({
      field: 'name',
      code: 'TOO_SMALL',
      params: { minimum: 3, inclusive: true, kind: 'string' }
    });
    // The technical fallback message is preserved for non-UI consumers.
    expect(typeof detail.message).toBe('string');
    expect(detail.message.length).toBeGreaterThan(0);
  });

  it('exposes a stable code for an unsupported enum value, with the allowlist', () => {
    const parsed = z.enum(['es-419', 'en-US']).safeParse('es-MX');
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(zodDetails(parsed.error)[0]).toMatchObject({
      code: 'UNSUPPORTED_VALUE',
      params: { allowed: ['es-419', 'en-US'], received: 'es-MX' }
    });
  });

  it('exposes the rejected keys for an unknown field', () => {
    const parsed = z.object({ a: z.string() }).strict().safeParse({ a: 'x', tenantId: 't1' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(zodDetails(parsed.error)[0]).toMatchObject({
      code: 'UNKNOWN_FIELD',
      params: { keys: ['tenantId'] }
    });
  });

  it('lets a refinement publish its own domain code and parameters', () => {
    const schema = z
      .object({ preferredLocale: z.string() })
      .superRefine((value, ctx) => {
        if (value.preferredLocale !== 'en-US') {
          localizedIssue(ctx, {
            path: ['preferredLocale'],
            code: 'UNSUPPORTED_LOCALE',
            message: 'must be one of: es-419, en-US',
            params: { allowed: ['es-419', 'en-US'] }
          });
        }
      });

    const parsed = schema.safeParse({ preferredLocale: 'es-MX' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const [detail] = zodDetails(parsed.error);
    // The domain code wins over the generic INVALID_VALUE...
    expect(detail.code).toBe('UNSUPPORTED_LOCALE');
    // ...and no longer leaks the internal `code` key as a parameter.
    expect(detail.params).toEqual({ allowed: ['es-419', 'en-US'] });
    expect(detail.field).toBe('preferredLocale');
  });

  it('keeps the code and the trace id in the HTTP envelope', async () => {
    const req = mockRequest({ body: { name: '' } });
    req.requestId = 'trace-locale';
    const error = await runHandler(validate(z.object({ name: z.string().min(1) })), req, mockResponse());

    const res = mockResponse();
    errorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.traceId).toBe('trace-locale');
    expect(res.body.details[0]).toMatchObject({ field: 'name', code: 'TOO_SMALL' });
    expect(typeof res.body.details[0].message).toBe('string');
  });
});

describe('error handler middleware', () => {
  it('maps domain errors to the standard envelope', () => {
    const req = mockRequest();
    req.requestId = 'trace-1';
    const res = mockResponse();

    errorHandler(new Conflict(), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toMatchObject({ statusCode: 409, code: 'CONFLICT', traceId: 'trace-1' });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('maps validation errors to 422 with details', () => {
    const parsed = z.object({ a: z.string() }).safeParse({});
    const error = parsed.success ? new Error('unreachable') : parsed.error;
    const res = mockResponse();

    errorHandler(error, mockRequest(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('maps malformed JSON to 400', () => {
    const syntaxError = new SyntaxError('Unexpected token');
    (syntaxError as any).body = '{';
    const res = mockResponse();

    errorHandler(syntaxError, mockRequest(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('maps database unique-constraint races to 409 without exposing Prisma internals', () => {
    const res = mockResponse();
    errorHandler({ code: 'P2002' }, mockRequest(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toMatchObject({ code: 'UNIQUE_CONSTRAINT' });
    expect(res.body.message).not.toContain('Prisma');
  });

  it('maps unknown errors to 500 and hides internals in production', () => {
    const res = mockResponse();
    errorHandler(new Error('boom'), mockRequest(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error throwables', () => {
    const res = mockResponse();
    errorHandler('weird', mockRequest(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('notFoundHandler forwards a NotFoundError', async () => {
    const error = await runHandler(notFoundHandler, mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe('specific error codes (product-specification contract)', () => {
  it('keeps the generic default for ValidationError', () => {
    const error = new ValidationError();

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the two-argument ValidationError call shape working', () => {
    // Every pre-existing call site passes (message, details). The new code is the
    // third parameter precisely so those calls do not change.
    const error = new ValidationError('Invalid input', [{ field: 'name', message: 'required' }]);

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toHaveLength(1);
  });

  it('lets ValidationError carry a specific 422 code', () => {
    const error = new ValidationError(
      'Barcode check digit is invalid',
      [
        {
          field: 'presentations.0.identifiers.0.value',
          code: 'INVALID_IDENTIFIER_CHECKSUM',
          message: 'check digit does not match'
        }
      ],
      'INVALID_IDENTIFIER_CHECKSUM'
    );

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('INVALID_IDENTIFIER_CHECKSUM');
    // The nested path is preserved verbatim: the page walks it against its own
    // FormArrays, so the server must not flatten or rewrite it.
    expect(error.details?.[0].field).toBe('presentations.0.identifiers.0.value');
  });

  it('lets ConflictError carry details so the colliding field can be located', () => {
    const error = new ConflictError('GTIN already used in this company', 'IDENTIFIER_ALREADY_EXISTS', [
      {
        field: 'presentations.1.identifiers.0.value',
        code: 'IDENTIFIER_ALREADY_EXISTS',
        message: 'already used'
      }
    ]);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('IDENTIFIER_ALREADY_EXISTS');
    expect(error.details?.[0].field).toBe('presentations.1.identifiers.0.value');
  });

  it('surfaces a specific 422 code and its details through the envelope', () => {
    const res = mockResponse();

    errorHandler(
      new ValidationError(
        'Unit is incompatible with the measurement',
        [{ field: 'measurements.weight.unitCode', code: 'UNIT_DIMENSION_MISMATCH', message: 'needs a mass unit' }],
        'UNIT_DIMENSION_MISMATCH'
      ),
      mockRequest(),
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.code).toBe('UNIT_DIMENSION_MISMATCH');
    expect(res.body.details?.[0].code).toBe('UNIT_DIMENSION_MISMATCH');
  });

  it('surfaces a conflict code and its details through the envelope', () => {
    const res = mockResponse();

    errorHandler(
      new ConflictError('GTIN already used in this company', 'IDENTIFIER_ALREADY_EXISTS', [
        {
          field: 'presentations.0.identifiers.0.value',
          code: 'IDENTIFIER_ALREADY_EXISTS',
          message: 'already used'
        }
      ]),
      mockRequest(),
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDENTIFIER_ALREADY_EXISTS');
    expect(res.body.details?.[0].field).toBe('presentations.0.identifiers.0.value');
  });
});

// Local helper mirroring ConflictError without importing it twice.
class Conflict extends AppError {
  constructor() {
    super('Conflict', 409, 'CONFLICT');
  }
}

describe('JWT authentication middleware', () => {
  it('extracts bearer tokens case-insensitively', () => {
    expect(extractBearerToken('Bearer abc')).toBe('abc');
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer   ')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('attaches the resolved user and actor', async () => {
    const verifier = { verifyAccessToken: jest.fn().mockResolvedValue(user()) };
    const req = mockRequest({ headers: { authorization: 'Bearer token' } });

    const error = await runHandler(createJwtAuthMiddleware(verifier), req, mockResponse());

    expect(error).toBeUndefined();
    expect(req.user?.id).toBe('user-1');
    expect(req.actor).toEqual({ id: 'user-1', type: 'user' });
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith('token');
  });

  it('rejects a missing token', async () => {
    const verifier = { verifyAccessToken: jest.fn() };
    const error = await runHandler(createJwtAuthMiddleware(verifier), mockRequest(), mockResponse());

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('propagates verifier failures', async () => {
    const verifier = {
      verifyAccessToken: jest.fn().mockRejectedValue(new UnauthorizedError('bad token'))
    };
    const req = mockRequest({ headers: { authorization: 'Bearer nope' } });

    const error = await runHandler(createJwtAuthMiddleware(verifier), req, mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe('permission guards', () => {
  it('allows a user holding the permission', async () => {
    const req = mockRequest();
    req.user = user({ permissions: ['products:read'] });
    expect(await runHandler(requirePermission('products:read'), req, mockResponse())).toBeUndefined();
  });

  it('allows the global admin regardless of the permission list', async () => {
    const req = mockRequest();
    req.user = user({ isGlobalAdmin: true, permissions: [] });
    expect(await runHandler(requirePermission('products:read'), req, mockResponse())).toBeUndefined();
  });

  it('denies a missing permission with 403', async () => {
    const req = mockRequest();
    req.user = user({ permissions: [] });
    const error = await runHandler(requirePermission('products:delete'), req, mockResponse());

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('denies an unauthenticated request with 401', async () => {
    const error = await runHandler(requirePermission('products:read'), mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('restricts global-admin-only guards', async () => {
    const adminReq = mockRequest();
    adminReq.user = user({ isGlobalAdmin: true });
    expect(await runHandler(requireGlobalAdmin, adminReq, mockResponse())).toBeUndefined();

    const tenantReq = mockRequest();
    tenantReq.user = user({ isGlobalAdmin: false });
    expect(await runHandler(requireGlobalAdmin, tenantReq, mockResponse())).toBeInstanceOf(ForbiddenError);

    expect(await runHandler(requireGlobalAdmin, mockRequest(), mockResponse())).toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe('API key middleware', () => {
  const resolver = {
    resolveByRawKey: jest.fn().mockResolvedValue({ id: 'key-1', tenantId: 'tenant-1', scopes: ['products:read'] })
  };

  beforeEach(() => resolver.resolveByRawKey.mockClear());

  it('resolves the tenant and scopes from the key', async () => {
    const req = mockRequest({ headers: { 'x-api-key': 'pg_secret' } });
    const error = await runHandler(createApiKeyAuthMiddleware(resolver), req, mockResponse());

    expect(error).toBeUndefined();
    expect(req.tenantId).toBe('tenant-1');
    expect(req.scopes).toEqual(['products:read']);
    expect(req.actor).toEqual({ id: 'key-1', type: 'api_key' });
  });

  it('requires the header', async () => {
    const error = await runHandler(createApiKeyAuthMiddleware(resolver), mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(resolver.resolveByRawKey).not.toHaveBeenCalled();
  });

  it('propagates resolution failures (invalid/expired/revoked)', async () => {
    const failing = { resolveByRawKey: jest.fn().mockRejectedValue(new UnauthorizedError('expired', 'API_KEY_EXPIRED')) };
    const req = mockRequest({ headers: { 'x-api-key': 'pg_expired' } });

    const error = await runHandler(createApiKeyAuthMiddleware(failing), req, mockResponse());
    expect((error as UnauthorizedError).code).toBe('API_KEY_EXPIRED');
  });

  it('enforces scopes', async () => {
    const allowed = mockRequest();
    allowed.scopes = ['products:read'];
    expect(await runHandler(requireScope('products:read'), allowed, mockResponse())).toBeUndefined();

    const denied = mockRequest();
    denied.scopes = ['prices:read'];
    const error = await runHandler(requireScope('products:read'), denied, mockResponse());
    expect((error as ForbiddenError).code).toBe('INSUFFICIENT_SCOPE');
  });

  it('reads scopes from the resolved api key when not flattened', async () => {
    const req = mockRequest();
    req.apiKey = { id: 'k', tenantId: 't', scopes: ['prices:read'] };
    expect(await runHandler(requireScope('prices:read'), req, mockResponse())).toBeUndefined();
  });
});

describe('tenant resolution middleware', () => {
  it('resolves the tenant from the API key', async () => {
    const req = mockRequest();
    req.apiKey = { id: 'k', tenantId: 'tenant-key', scopes: [] };

    await runHandler(resolveTenant, req, mockResponse());
    expect(req.tenantId).toBe('tenant-key');
  });

  it('uses X-Tenant-Id for a global admin', async () => {
    const req = mockRequest({ headers: { 'x-tenant-id': 'tenant-selected' } });
    req.user = user({ isGlobalAdmin: true, tenantId: null });

    await runHandler(resolveTenant, req, mockResponse());
    expect(req.tenantId).toBe('tenant-selected');
  });

  it('falls back to the JWT tenant for a global admin without the header', async () => {
    const req = mockRequest();
    req.user = user({ isGlobalAdmin: true, tenantId: 'tenant-home' });

    await runHandler(resolveTenant, req, mockResponse());
    expect(req.tenantId).toBe('tenant-home');
  });

  it('takes a non-global user tenant from the JWT', async () => {
    const req = mockRequest();
    req.user = user({ tenantId: 'tenant-jwt' });

    await runHandler(resolveTenant, req, mockResponse());
    expect(req.tenantId).toBe('tenant-jwt');
  });

  it('rejects X-Tenant-Id sent by a non-global user', async () => {
    const req = mockRequest({ headers: { 'x-tenant-id': 'tenant-other' } });
    req.user = user({ isGlobalAdmin: false, tenantId: 'tenant-jwt' });

    const error = await runHandler(resolveTenant, req, mockResponse());
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).code).toBe('TENANT_HEADER_NOT_ALLOWED');
  });

  it('rejects unauthenticated requests', async () => {
    const error = await runHandler(resolveTenant, mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('requireTenantContext demands a resolved tenant', async () => {
    const withTenant = mockRequest();
    withTenant.tenantId = 'tenant-1';
    expect(await runHandler(requireTenantContext, withTenant, mockResponse())).toBeUndefined();

    const withoutTenant = mockRequest();
    withoutTenant.tenantId = null;
    const error = await runHandler(requireTenantContext, withoutTenant, mockResponse());
    expect((error as UnauthorizedError).code).toBe('TENANT_REQUIRED');
  });
});
