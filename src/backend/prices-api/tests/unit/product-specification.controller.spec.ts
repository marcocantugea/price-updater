import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/di/container';
import { hashApiKey } from '../../src/common/utils/api-key';
import { hashPassword } from '../../src/common/utils/password';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const OTHER_PRODUCT = '33333333-3333-4333-8333-333333333333';
const MISSING_PRODUCT = '44444444-4444-4444-8444-444444444444';
// Brand and supplier ids must be real UUIDs: the body is validated before the
// service sees it, so a readable placeholder like 'brand-1' is a 422.
const BRAND = '55555555-5555-4555-8555-555555555555';
const SUPPLIER = '66666666-6666-4666-8666-666666666666';
const EAN_13 = '7501234567893';

/**
 * HTTP-level tests for the aggregate routes. These run through the real Express
 * app, so they cover what the unit suites cannot: the route path, the guard
 * order, param validation, the strict body, and the error envelope the client
 * actually receives.
 */
async function buildApp() {
  const prisma = createFakePrisma({
    currency: [
      { id: 'c1', code: 'MXN', name: 'Peso', symbol: '$', decimals: 2, status: 'active', deletedAt: null }
    ],
    permission: [
      { id: 'perm-read', slug: 'products:read', name: 'View products', deletedAt: null },
      { id: 'perm-update', slug: 'products:update', name: 'Edit products', deletedAt: null },
      // Catalog permissions added by the specification feature. Without them the
      // catalog routes are a 403, which is itself the guard working correctly.
      ...['brands:read', 'brands:create', 'brands:update', 'brands:delete',
        'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete',
        'units-of-measure:read', 'units-of-measure:create', 'units-of-measure:update',
        'units-of-measure:delete'].map((slug) => ({
        id: `perm-${slug}`,
        slug,
        name: slug,
        deletedAt: null
      }))
    ],
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
        id: 'role-viewer',
        tenantId: null,
        slug: 'readonly_user',
        name: 'Read only',
        isSystem: true,
        status: 'active',
        deletedAt: null
      },
      {
        id: 'role-global',
        tenantId: null,
        slug: 'global_admin',
        name: 'Global admin',
        isSystem: true,
        status: 'active',
        deletedAt: null
      }
    ],
    rolePermission: [
      { roleId: 'role-1', permissionId: 'perm-read' },
      { roleId: 'role-1', permissionId: 'perm-update' },
      ...['brands:read', 'brands:create', 'brands:update', 'brands:delete',
        'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete',
        'units-of-measure:read'].map((slug) => ({ roleId: 'role-1', permissionId: `perm-${slug}` })),
      // Deliberately read-only: proves the write routes check `products:update`
      // and not merely `products:read`.
      { roleId: 'role-viewer', permissionId: 'perm-read' }
    ],
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
        id: 'user-2',
        tenantId: TENANT,
        name: 'Viewer',
        email: 'viewer@example.com',
        passwordHash: await hashPassword('Password!123'),
        roleId: 'role-viewer',
        status: 'active',
        preferredLocale: 'es-419',
        deletedAt: null
      },
      {
        // Global administrator: no company of its own, and the only role that
        // may write to the global unit catalog.
        id: 'user-3',
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
    product: [
      {
        id: PRODUCT,
        tenantId: TENANT,
        sku: 'SKU-1',
        name: 'Product one',
        basePrice: 100,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null
      },
      {
        id: OTHER_PRODUCT,
        tenantId: TENANT,
        sku: 'SKU-2',
        name: 'Product two',
        basePrice: 200,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null
      }
    ],
    unitOfMeasure: [
      { id: 'u-ea', code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimals: 0, status: 'active', deletedAt: null },
      { id: 'u-kg', code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'mass', decimals: 3, status: 'active', deletedAt: null },
      { id: 'u-cm', code: 'CM', name: 'Centimeter', symbol: 'cm', dimension: 'length', decimals: 3, status: 'active', deletedAt: null }
    ],
    brand: [{ id: BRAND, tenantId: TENANT, name: 'Acme', status: 'active', deletedAt: null }],
    supplier: [{ id: SUPPLIER, name: 'Norte', status: 'active', deletedAt: null }],
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
    ]
  });

  buildContainer(prisma);
  return { app: createApp(prisma), prisma };
}

async function signIn(app: any, email = 'admin@example.com') {
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password!123' });
  expect(login.status).toBe(200);
  return { authorization: `Bearer ${login.body.accessToken as string}` };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND,
    model: 'ACM-2026',
    measurements: {
      weight: { value: 1.25, unitCode: 'KG' },
      length: { value: 30, unitCode: 'CM' },
      depth: null
    },
    presentations: [
      {
        name: 'Caja de 12',
        quantity: 12,
        unitCode: 'EA',
        identifiers: [{ type: 'ean_13', value: EAN_13 }]
      }
    ],
    supplierIds: [SUPPLIER],
    ...overrides
  };
}

describe('product specification routes', () => {
  it('returns an empty aggregate for a product with nothing captured', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const response = await request(app)
      .get(`/api/v1/products/${PRODUCT}/specification`)
      .set(headers);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      product: { id: PRODUCT, sku: 'SKU-1', name: 'Product one' },
      specification: null,
      presentations: [],
      suppliers: []
    });
  });

  it('replaces the aggregate and returns it, then serves it back on GET', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);
    const path = `/api/v1/products/${PRODUCT}/specification`;

    const put = await request(app).put(path).set(headers).send(validBody());

    expect(put.status).toBe(200);
    expect(put.body.specification).toMatchObject({
      brandId: BRAND,
      brandName: 'Acme',
      model: 'ACM-2026',
      measurements: {
        weight: { value: 1.25, unitCode: 'KG' },
        length: { value: 30, unitCode: 'CM' },
        depth: null
      }
    });
    expect(put.body.presentations[0].identifiers[0]).toMatchObject({
      value: EAN_13,
      normalizedValue: '07501234567893'
    });
    expect(put.body.suppliers).toEqual([{ id: SUPPLIER, name: 'Norte' }]);

    const get = await request(app).get(path).set(headers);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(put.body);
  });

  it('soft-deletes the aggregate on DELETE without touching the product', async () => {
    const { app, prisma } = await buildApp();
    const headers = await signIn(app);
    const path = `/api/v1/products/${PRODUCT}/specification`;

    await request(app).put(path).set(headers).send(validBody());
    const removed = await request(app).delete(path).set(headers);

    expect(removed.status).toBe(200);
    expect(removed.body.specification).toBeNull();
    expect(removed.body.presentations).toEqual([]);

    // The product row itself is untouched and still served by the generic route.
    const product = await request(app).get(`/api/v1/products/${PRODUCT}`).set(headers);
    expect(product.status).toBe(200);
    expect(product.body.sku).toBe('SKU-1');
    expect(prisma.__store.product.find((row: any) => row.id === PRODUCT).deletedAt).toBeNull();
  });

  it('keeps the generic Product CRUD route working alongside the nested one', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const list = await request(app).get('/api/v1/products').set(headers);
    expect(list.status).toBe(200);

    const one = await request(app).get(`/api/v1/products/${OTHER_PRODUCT}`).set(headers);
    expect(one.status).toBe(200);
    expect(one.body.sku).toBe('SKU-2');
  });

  it('returns 404 for a missing or cross-tenant product', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const missing = await request(app)
      .get(`/api/v1/products/${MISSING_PRODUCT}/specification`)
      .set(headers);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const put = await request(app)
      .put(`/api/v1/products/${MISSING_PRODUCT}/specification`)
      .set(headers)
      .send(validBody());
    expect(put.status).toBe(404);
  });

  it('requires authentication', async () => {
    const { app } = await buildApp();

    const response = await request(app).get(`/api/v1/products/${PRODUCT}/specification`);

    expect(response.status).toBe(401);
  });

  it('denies the write verbs to a user without products:update', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app, 'viewer@example.com');
    const path = `/api/v1/products/${PRODUCT}/specification`;

    // Reading is allowed with products:read alone...
    const read = await request(app).get(path).set(headers);
    expect(read.status).toBe(200);

    // ...but the aggregate cannot be edited.
    const put = await request(app).put(path).set(headers).send(validBody());
    expect(put.status).toBe(403);

    const remove = await request(app).delete(path).set(headers);
    expect(remove.status).toBe(403);
  });

  it('rejects a non-UUID product id with a 422 before touching the database', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const response = await request(app)
      .get('/api/v1/products/SKU-1/specification')
      .set(headers);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details[0].field).toBe('productId');
  });

  it('rejects a body with unknown keys, including fields the client must not set', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);
    const path = `/api/v1/products/${PRODUCT}/specification`;

    for (const body of [
      validBody({ tenantId: TENANT }),
      validBody({ status: 'inactive' }),
      validBody({ deletedAt: new Date().toISOString() }),
      validBody({ unexpected: 1 })
    ]) {
      const response = await request(app).put(path).set(headers).send(body);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }

    // Nothing was written by any rejected request.
    const get = await request(app).get(path).set(headers);
    expect(get.body.specification).toBeNull();
  });

  it('rejects an incomplete replacement with a field-level detail', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    // `presentations` is required: omission is not "leave it alone".
    const body = validBody();
    delete (body as any).presentations;

    const response = await request(app)
      .put(`/api/v1/products/${PRODUCT}/specification`)
      .set(headers)
      .send(body);

    expect(response.status).toBe(422);
    expect(response.body.details.map((detail: any) => detail.field)).toContain('presentations');
  });

  it('surfaces the service-level contract codes through the envelope', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);
    const path = `/api/v1/products/${PRODUCT}/specification`;

    const checksum = await request(app)
      .put(path)
      .set(headers)
      .send(
        validBody({
          presentations: [
            { name: 'Caja', quantity: 1, unitCode: 'EA', identifiers: [{ type: 'ean_13', value: '7501234567890' }] }
          ]
        })
      );

    expect(checksum.status).toBe(422);
    expect(checksum.body.code).toBe('INVALID_IDENTIFIER_CHECKSUM');
    expect(checksum.body.details[0].field).toBe('presentations.0.identifiers.0.value');

    const dimension = await request(app)
      .put(path)
      .set(headers)
      .send(validBody({ measurements: { weight: { value: 1, unitCode: 'CM' } } }));

    expect(dimension.status).toBe(422);
    expect(dimension.body.code).toBe('UNIT_DIMENSION_MISMATCH');
    expect(dimension.body.details[0].field).toBe('measurements.weight.unitCode');
  });

  it('serves the three catalog routes with their own permissions', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const brands = await request(app).get('/api/v1/brands').set(headers);
    expect(brands.status).toBe(200);
    expect(brands.body.data.map((row: any) => row.name)).toEqual(['Acme']);

    const suppliers = await request(app).get('/api/v1/suppliers').set(headers);
    expect(suppliers.status).toBe(200);
    expect(suppliers.body.data.map((row: any) => row.name)).toEqual(['Norte']);

    const units = await request(app).get('/api/v1/units-of-measure').set(headers);
    expect(units.status).toBe(200);
    // Compared as a set: the generic list always applies an `order` of its own
    // (see the note in model-options.ts), so asserting a specific server order
    // here would pin behaviour this feature does not own.
    expect(units.body.data.map((row: any) => row.code).sort()).toEqual(['CM', 'EA', 'KG']);

    // Filtering by dimension is what the UI needs for the unit picker.
    const mass = await request(app).get('/api/v1/units-of-measure?dimension=mass').set(headers);
    expect(mass.body.data.map((row: any) => row.code)).toEqual(['KG']);
  });

  it('keeps the unit catalog readable for tenant users but not writable', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    // The tenant admin holds every unit permission except the three write slugs,
    // and the write routes are global-only besides.
    const response = await request(app)
      .post('/api/v1/units-of-measure')
      .set(headers)
      .send({ code: 'XX', name: 'Bogus', symbol: 'xx', dimension: 'count', decimals: 0 });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('GLOBAL_ADMIN_REQUIRED');
  });

  it('rejects a brand body that tries to set a tenant or an unknown field', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const response = await request(app)
      .post('/api/v1/brands')
      .set(headers)
      .send({ name: 'Globex', tenantId: 'other' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('does not leak the new relations through the external products API', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    // Capture a full aggregate first, so the relations genuinely exist and a
    // leaked include would have something to serialize.
    await request(app)
      .put(`/api/v1/products/${PRODUCT}/specification`)
      .set(headers)
      .send(validBody());

    const external = await request(app)
      .get('/api/v1/external/products')
      .set('x-api-key', 'pg_external_secret');

    expect(external.status).toBe(200);

    const serialized = JSON.stringify(external.body);
    for (const leaked of ['specification', 'presentations', 'identifiers', 'suppliers', 'brandName']) {
      expect(serialized).not.toContain(leaked);
    }

    // The external contract is unchanged: the same product fields as before.
    const product = external.body.data.find((row: any) => row.id === PRODUCT);
    expect(product).toMatchObject({ id: PRODUCT, sku: 'SKU-1', name: 'Product one' });
  });
});

/**
 * The global unit catalog is the only resource whose writes are global-only,
 * and the only one a tenant user can read without a company of its own. Both
 * halves of that contract are asserted here, on the real routes.
 */
describe('unit of measure routes', () => {
  const globalSignIn = (app: any) => signIn(app, 'global@example.com');
  const viewerSignIn = (app: any) => signIn(app, 'viewer@example.com');

  const createBody = (overrides: Record<string, unknown> = {}) => ({
    code: 'ZZ',
    name: 'Zeta',
    symbol: 'zz',
    dimension: 'count',
    decimals: 0,
    ...overrides
  });

  it('rejects an unauthenticated write with 401', async () => {
    const { app } = await buildApp();

    const response = await request(app).post('/api/v1/units-of-measure').send(createBody());

    expect(response.status).toBe(401);
  });

  it('rejects a read-only tenant user with 403', async () => {
    const { app } = await buildApp();
    const headers = await viewerSignIn(app);

    const response = await request(app).post('/api/v1/units-of-measure').set(headers).send(createBody());

    expect(response.status).toBe(403);
  });

  it('lets a global administrator create a unit with no company selected', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const response = await request(app)
      .post('/api/v1/units-of-measure')
      .set(headers)
      .send(createBody({ code: ' zz ' }));

    expect(response.status).toBe(201);
    // Normalized by the validator, not by the client.
    expect(response.body).toMatchObject({ code: 'ZZ', name: 'Zeta', status: 'active' });
  });

  it('validates the strict body and the empty PATCH', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const unknownKey = await request(app)
      .post('/api/v1/units-of-measure')
      .set(headers)
      .send(createBody({ tenantId: TENANT }));
    expect(unknownKey.status).toBe(422);

    const badCode = await request(app)
      .post('/api/v1/units-of-measure')
      .set(headers)
      .send(createBody({ code: 'K G' }));
    expect(badCode.status).toBe(422);
    expect(badCode.body.details[0].code).toBe('UNIT_CODE_FORMAT');

    const emptyPatch = await request(app).patch('/api/v1/units-of-measure/u-kg').set(headers).send({});
    expect(emptyPatch.status).toBe(422);
    expect(emptyPatch.body.details[0].code).toBe('EMPTY_UPDATE_BODY');
  });

  it('rejects a duplicate code with a field-level 409', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const response = await request(app)
      .post('/api/v1/units-of-measure')
      .set(headers)
      .send(createBody({ code: 'KG', name: 'Kilogramo', symbol: 'kg', dimension: 'mass', decimals: 3 }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('UNIT_CODE_TAKEN');
    expect(response.body.details).toEqual([expect.objectContaining({ field: 'code' })]);
  });

  it('rejects a code change but accepts a safe edit', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const immutable = await request(app)
      .patch('/api/v1/units-of-measure/u-kg')
      .set(headers)
      .send({ code: 'LB' });

    expect(immutable.status).toBe(422);
    expect(immutable.body.code).toBe('UNIT_CODE_IMMUTABLE');

    const safe = await request(app)
      .patch('/api/v1/units-of-measure/u-kg')
      .set(headers)
      .send({ name: 'Kilogramo', decimals: 2 });

    expect(safe.status).toBe(200);
    expect(safe.body).toMatchObject({ code: 'KG', name: 'Kilogramo', decimals: 2 });
  });

  it('soft-deletes a unit, which then disappears from the list', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const removed = await request(app).delete('/api/v1/units-of-measure/u-kg').set(headers);
    expect(removed.status).toBe(200);
    expect(removed.body.status).toBe('inactive');
    expect(removed.body.deletedAt).not.toBeNull();

    const list = await request(app).get('/api/v1/units-of-measure').set(headers);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: any) => row.code)).not.toContain('KG');
  });

  it('serves the catalog to a global administrator with no tenant context', async () => {
    const { app } = await buildApp();
    const headers = await globalSignIn(app);

    const list = await request(app).get('/api/v1/units-of-measure?status=active').set(headers);

    expect(list.status).toBe(200);
    expect(list.body.data.map((row: any) => row.code).sort()).toEqual(['CM', 'EA', 'KG']);
  });
});

/**
 * Supplier routes at the HTTP level. The catalog is global, so writes are for a
 * global administrator and reads stay open to a company user; the 409 carries the
 * offending field, and creating the name of a deleted supplier revives that row.
 */
describe('supplier routes', () => {
  it('lets a company user read the global catalog without a company header', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const response = await request(app).get('/api/v1/suppliers').set(headers);

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: any) => row.name)).toEqual(['Norte']);
    // The global catalog no longer carries a tenant.
    expect(response.body.data[0].tenantId).toBeUndefined();
  });

  it('refuses a company administrator the write verbs', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app);

    const response = await request(app).post('/api/v1/suppliers').set(headers).send({ name: 'Sur' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('GLOBAL_ADMIN_REQUIRED');
  });

  it('answers a duplicate name with a field-level 409', async () => {
    const { app } = await buildApp();
    const headers = await signIn(app, 'global@example.com');

    const response = await request(app).post('/api/v1/suppliers').set(headers).send({ name: 'Norte' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_NAME_TAKEN');
    expect(response.body.details).toEqual([expect.objectContaining({ field: 'name' })]);
  });

  it('revives a deleted supplier with the same id, keeping its product links', async () => {
    const { app, prisma } = await buildApp();
    const headers = await signIn(app, 'global@example.com');

    const created = await request(app).post('/api/v1/suppliers').set(headers).send({ name: 'Sur' });
    expect(created.status).toBe(201);

    const removed = await request(app).delete(`/api/v1/suppliers/${created.body.id}`).set(headers);
    expect(removed.status).toBe(200);

    const revived = await request(app).post('/api/v1/suppliers').set(headers).send({ name: 'Sur' });

    expect(revived.status).toBe(201);
    expect(revived.body.id).toBe(created.body.id);
    expect(revived.body.deletedAt).toBeNull();
    expect(prisma.__store.supplier).toHaveLength(2); // Norte + the revived Sur
  });
});
