import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/di/container';
import { hashPassword } from '../../src/common/utils/password';
import { hashApiKey } from '../../src/common/utils/api-key';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = '11111111-1111-4111-8111-111111111111';

async function buildApp() {
  const prisma = createFakePrisma({
    currency: [{ id: 'c1', code: 'MXN', name: 'Peso', symbol: '$', decimals: 2, status: 'active', deletedAt: null }],
    permission: [{ id: 'perm-read', slug: 'products:read', name: 'View products', deletedAt: null }],
    role: [
      {
        id: 'role-1',
        tenantId: null,
        slug: 'tenant_admin',
        name: 'Tenant admin',
        isSystem: true,
        status: 'active',
        deletedAt: null
      },
      {
        id: 'role-global',
        tenantId: null,
        slug: 'global_admin',
        name: 'Global administrator',
        isSystem: true,
        status: 'active',
        deletedAt: null
      }
    ],
    rolePermission: [{ roleId: 'role-1', permissionId: 'perm-read' }],
    user: [
      {
        id: 'user-1',
        tenantId: TENANT,
        name: 'Admin',
        email: 'admin@example.com',
        passwordHash: await hashPassword('Password!123'),
        roleId: 'role-1',
        status: 'active',
        preferredLocale: 'es-419',
        deletedAt: null
      },
      {
        // Global administrator with no company of their own.
        id: 'user-global',
        tenantId: null,
        name: 'Global',
        email: 'global@example.com',
        passwordHash: await hashPassword('Password!123'),
        roleId: 'role-global',
        status: 'active',
        preferredLocale: 'es-419',
        deletedAt: null
      }
    ],
    apiKey: [
      {
        id: 'key-1',
        tenantId: TENANT,
        name: 'External key',
        keyHash: hashApiKey('pg_external_secret'),
        prefix: 'pg_external',
        scopes: ['products:read'],
        status: 'active',
        expiresAt: null,
        revokedAt: null,
        deletedAt: null
      }
    ],
    product: [
      {
        id: 'prod-1',
        tenantId: TENANT,
        sku: 'SKU-1',
        name: 'Product',
        basePrice: new Prisma.Decimal('100.00'),
        // A real Decimal, so the HTTP response proves the serialization path.
        cost: new Prisma.Decimal('90.00'),
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-01-01')
      },
      {
        // The "cost not captured" state: NULL must survive as JSON null.
        id: 'prod-2',
        tenantId: TENANT,
        sku: 'SKU-2',
        name: 'Product without cost',
        basePrice: new Prisma.Decimal('200.00'),
        cost: null,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-01-02')
      }
    ]
  });

  buildContainer(prisma);
  return { app: createApp(prisma), prisma };
}

describe('Express application wiring', () => {
  it('exposes the health check at /health and /api/v1/health', async () => {
    const { app } = await buildApp();

    const root = await request(app).get('/health');
    expect(root.status).toBe(200);
    expect(root.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof root.body.uptime).toBe('number');
    expect(typeof root.body.version).toBe('string');

    const versioned = await request(app).get('/api/v1/health');
    expect(versioned.status).toBe(200);
  });

  it('reports a degraded database state', async () => {
    const { app, prisma } = await buildApp();
    prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('connection refused'));

    const response = await request(app).get('/health');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('returns the standard 404 envelope for unknown routes', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(response.body.traceId).toBeTruthy();
  });

  it('echoes a correlation id on every response', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/health').set('x-request-id', 'trace-abc');
    expect(response.headers['x-request-id']).toBe('trace-abc');
  });

  it('rejects malformed JSON with a 400 envelope', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JSON');
  });

  it('validates login input', async () => {
    const { app } = await buildApp();

    const response = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid credentials with a generic error', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in, sets an HttpOnly refresh cookie and authenticates subsequent requests', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user).toMatchObject({ email: 'admin@example.com', roleSlug: 'tenant_admin' });

    const cookie = login.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('pg_refresh_token=');
    expect(cookie.toLowerCase()).toContain('httponly');

    const accessToken = login.body.accessToken as string;
    const me = await request(app).get('/api/v1/auth/me').set('authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: 'user-1' });

    const products = await request(app)
      .get('/api/v1/products')
      .set('authorization', `Bearer ${accessToken}`);
    expect(products.status).toBe(200);
    expect(products.body.data).toHaveLength(2);
  });

  it('returns the product cost on list and detail, with NULL preserved', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });
    const auth = { authorization: `Bearer ${login.body.accessToken as string}` };

    const list = await request(app).get('/api/v1/products').set(auth);
    const known = list.body.data.find((row: any) => row.sku === 'SKU-1');
    const unknown = list.body.data.find((row: any) => row.sku === 'SKU-2');

    expect(known.cost).toBe(90);
    expect(typeof known.cost).toBe('number');
    expect(known.cost).not.toBe('90.00');
    // A product whose cost was never captured reports null, never 0.
    expect(unknown.cost).toBeNull();
    expect(unknown.cost).not.toBe(0);

    const detail = await request(app).get('/api/v1/products/prod-1').set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ sku: 'SKU-1', cost: 90, currencyCode: 'MXN' });
  });

  it('refreshes using the refresh cookie', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', login.headers['set-cookie']);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // The refresh token rotates even when the access token payload is identical.
    expect(refreshed.headers['set-cookie']?.[0]).not.toBe(login.headers['set-cookie']?.[0]);
  });

  it('logs out and clears the refresh cookie', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', login.headers['set-cookie']);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).post('/api/v1/auth/refresh').set('Cookie', login.headers['set-cookie']);
    expect(afterLogout.status).toBe(401);
  });

  it('requires authentication on the admin API', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/products');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('serves the external read-only API with an API key and enforces scopes', async () => {
    const { app } = await buildApp();

    const withoutKey = await request(app).get('/api/v1/external/products');
    expect(withoutKey.status).toBe(401);
    expect(withoutKey.body.code).toBe('API_KEY_REQUIRED');

    const withKey = await request(app).get('/api/v1/external/products').set('x-api-key', 'pg_external_secret');
    expect(withKey.status).toBe(200);
    expect(withKey.body.data).toHaveLength(2);

    // Approved decision: `products:read` also exposes the cost in the external
    // Product response. It is additive, so existing consumers ignore it.
    const withCost = withKey.body.data.find((row: any) => row.sku === 'SKU-1');
    const withoutCost = withKey.body.data.find((row: any) => row.sku === 'SKU-2');
    expect(withCost.cost).toBe(90);
    expect(typeof withCost.cost).toBe('number');
    expect(withoutCost.cost).toBeNull();

    // The key only holds products:read.
    const forbidden = await request(app).get('/api/v1/external/prices').set('x-api-key', 'pg_external_secret');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('does not expose write verbs on the external API', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/external/products')
      .set('x-api-key', 'pg_external_secret');

    expect(response.status).toBe(404);
  });

  it('rejects an unknown API key', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/external/products').set('x-api-key', 'pg_wrong');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_API_KEY');
  });
});

describe('User language preferences endpoint', () => {
  async function signIn(app: any, email = 'admin@example.com') {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password!123' });
    expect(login.status).toBe(200);
    return { accessToken: login.body.accessToken as string, cookie: login.headers['set-cookie'] };
  }

  it('updates the authenticated user and returns the full context', async () => {
    const { app } = await buildApp();
    const { accessToken } = await signIn(app);

    const response = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'user-1',
      email: 'admin@example.com',
      roleSlug: 'tenant_admin',
      preferredLocale: 'en-US'
    });
    // The locale is not authorization data and must not leak into a token.
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('persists the change so a follow-up /auth/me returns it', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken } = await signIn(app);

    await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });

    const me = await request(app).get('/api/v1/auth/me').set('authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.preferredLocale).toBe('en-US');

    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').preferredLocale).toBe('en-US');
  });

  it('also returns the stored locale on login and refresh', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken, cookie } = await signIn(app);

    await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });
    expect(relogin.body.user.preferredLocale).toBe('en-US');

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.preferredLocale).toBe('en-US');

    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').preferredLocale).toBe('en-US');
  });

  it('works for a global administrator without X-Tenant-Id', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken } = await signIn(app, 'global@example.com');

    const response = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'user-global', isGlobalAdmin: true, preferredLocale: 'en-US' });
    // No tenant context is required, and the tenant-less admin is still tenant-less.
    expect(response.body.tenantId).toBeNull();
    expect(prisma.__store.user.find((row: any) => row.id === 'user-global').preferredLocale).toBe('en-US');
  });

  it('requires a valid access token', async () => {
    const { app } = await buildApp();

    const anonymous = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .send({ preferredLocale: 'en-US' });
    expect(anonymous.status).toBe(401);

    const forged = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', 'Bearer not-a-token')
      .send({ preferredLocale: 'en-US' });
    expect(forged.status).toBe(401);
  });

  it('rejects an unsupported locale with a stable validation code', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken } = await signIn(app);

    for (const rejected of ['es', 'en', 'es-MX', 'ES-419', 'fr-FR']) {
      const response = await request(app)
        .patch('/api/v1/auth/me/preferences')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ preferredLocale: rejected });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details[0]).toMatchObject({
        field: 'preferredLocale',
        code: 'UNSUPPORTED_VALUE',
        params: { allowed: ['es-419', 'en-US'] }
      });
    }

    // Nothing was persisted.
    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').preferredLocale).toBe('es-419');
  });

  it('rejects unknown fields and cannot be pointed at another user', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken } = await signIn(app);

    const extraField = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US', userId: 'user-global' });
    expect(extraField.status).toBe(422);
    expect(extraField.body.code).toBe('VALIDATION_ERROR');

    const empty = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({});
    expect(empty.status).toBe(422);

    // Only the caller's own row is eligible to change.
    expect(prisma.__store.user.find((row: any) => row.id === 'user-global').preferredLocale).toBe('es-419');
    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').preferredLocale).toBe('es-419');
  });

  it('does not rotate the refresh cookie when the language changes', async () => {
    const { app, prisma } = await buildApp();
    const { accessToken, cookie } = await signIn(app);

    const response = await request(app)
      .patch('/api/v1/auth/me/preferences')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });

    expect(response.headers['set-cookie']).toBeUndefined();

    // The fake Prisma double does not apply column defaults, so "not revoked"
    // means the field is falsy rather than strictly null.
    const active = prisma.__store.refreshToken.filter(
      (row: any) => row.userId === 'user-1' && !row.revokedAt
    );
    expect(active).toHaveLength(1);

    // The original session stays usable.
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
  });

  it('still requires tenant context and permissions on the administrative user CRUD', async () => {
    const { app } = await buildApp();
    const { accessToken } = await signIn(app, 'global@example.com');

    // A global admin with no selected company cannot reach the admin users API.
    const withoutTenant = await request(app)
      .patch('/api/v1/users/user-1')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ preferredLocale: 'en-US' });
    expect(withoutTenant.status).toBe(401);
    expect(withoutTenant.body.code).toBe('TENANT_REQUIRED');
  });
});
