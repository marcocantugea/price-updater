import { AuthController } from '../../src/controllers/auth.controller';
import { TenantController } from '../../src/controllers/tenant.controller';
import { ApiKeyController } from '../../src/controllers/api-key.controller';
import { PriceController } from '../../src/controllers/price.controller';
import { DashboardController } from '../../src/controllers/dashboard.controller';
import { RoleController } from '../../src/controllers/role.controller';
import { PriceListController } from '../../src/controllers/price-list.controller';
import { UnauthorizedError } from '../../src/common/errors';
import { mockRequest, mockResponse, runHandler } from '../helpers/http';

describe('AuthController', () => {
  function build() {
    const authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        refreshExpiresAt: new Date('2024-02-01'),
        user: { id: 'user-1', email: 'a@b.com' }
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        refreshExpiresAt: new Date('2024-02-01'),
        user: { id: 'user-1' }
      }),
      logout: jest.fn().mockResolvedValue(undefined),
      me: jest.fn().mockResolvedValue({ id: 'user-1', roleSlug: 'tenant_admin' }),
      updatePreferences: jest.fn().mockResolvedValue({ id: 'user-1', preferredLocale: 'en-US' })
    };
    return { authService, controller: new AuthController(authService as any) };
  }

  it('logs in, returning the access token and setting the refresh cookie', async () => {
    const { authService, controller } = build();
    const req = mockRequest({ body: { email: 'a@b.com', password: 'secret' }, headers: { 'user-agent': 'jest' } });
    const res = mockResponse();

    await runHandler(controller.login, req, res);

    expect(authService.login).toHaveBeenCalledWith('a@b.com', 'secret', expect.objectContaining({ userAgent: 'jest' }));
    expect(res.body).toEqual({ accessToken: 'access-1', user: { id: 'user-1', email: 'a@b.com' } });
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.cookie).toHaveBeenCalledWith('pg_refresh_token', 'refresh-1', expect.objectContaining({ httpOnly: true }));
  });

  it('refreshes from the cookie and rotates it', async () => {
    const { authService, controller } = build();
    const req = mockRequest({ cookies: { pg_refresh_token: 'stored-token' } });
    const res = mockResponse();

    await runHandler(controller.refresh, req, res);

    expect(authService.refresh).toHaveBeenCalledWith('stored-token', expect.anything());
    expect(res.cookie).toHaveBeenCalledWith('pg_refresh_token', 'refresh-2', expect.anything());
  });

  it('rejects a refresh without the cookie', async () => {
    const { controller } = build();
    const error = await runHandler(controller.refresh, mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('logs out, clearing the cookie', async () => {
    const { authService, controller } = build();
    const req = mockRequest({ cookies: { pg_refresh_token: 'stored-token' } });
    const res = mockResponse();

    await runHandler(controller.logout, req, res);

    expect(authService.logout).toHaveBeenCalledWith('stored-token');
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('returns the current user', async () => {
    const { controller } = build();
    const req = mockRequest();
    req.user = { id: 'user-1' };
    const res = mockResponse();

    await runHandler(controller.me, req, res);
    expect(res.body).toMatchObject({ id: 'user-1' });
  });

  it('rejects me without an authenticated user', async () => {
    const { controller } = build();
    const error = await runHandler(controller.me, mockRequest(), mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('updates the locale of the authenticated user only', async () => {
    const { authService, controller } = build();
    const req = mockRequest({ body: { preferredLocale: 'en-US' } });
    req.user = { id: 'user-1' };
    const res = mockResponse();

    await runHandler(controller.updatePreferences, req, res);

    // The target id comes from the verified token, never from the payload.
    expect(authService.updatePreferences).toHaveBeenCalledWith('user-1', 'en-US');
    expect(res.body).toEqual({ id: 'user-1', preferredLocale: 'en-US' });
  });

  it('ignores any user identifier supplied by the client', async () => {
    const { authService, controller } = build();
    const req = mockRequest({
      body: { preferredLocale: 'en-US', userId: 'user-999', id: 'user-999' },
      params: { id: 'user-999' }
    });
    req.user = { id: 'user-1' };

    await runHandler(controller.updatePreferences, req, mockResponse());

    expect(authService.updatePreferences).toHaveBeenCalledTimes(1);
    expect(authService.updatePreferences).toHaveBeenCalledWith('user-1', 'en-US');
  });

  it('requires authentication to change the locale', async () => {
    const { authService, controller } = build();

    const error = await runHandler(
      controller.updatePreferences,
      mockRequest({ body: { preferredLocale: 'en-US' } }),
      mockResponse()
    );

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(authService.updatePreferences).not.toHaveBeenCalled();
  });
});

describe('TenantController', () => {
  function build() {
    const tenantService = {
      list: jest.fn().mockResolvedValue({ data: [{ id: 't1' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      get: jest.fn().mockResolvedValue({ id: 't1' }),
      current: jest.fn().mockResolvedValue({ id: 't1' }),
      updateTimeZone: jest.fn().mockResolvedValue({ id: 't1', timeZone: 'America/Mexico_City' }),
      create: jest.fn().mockResolvedValue({ id: 't-new' }),
      update: jest.fn().mockResolvedValue({ id: 't1', commercialName: 'Updated' }),
      remove: jest.fn().mockResolvedValue({ id: 't1', deletedAt: 'x' })
    };
    return { tenantService, controller: new TenantController(tenantService as any) };
  }

  it('lists companies without requiring a tenant context', async () => {
    const { tenantService, controller } = build();
    const res = mockResponse();

    await runHandler(controller.list, mockRequest({ query: { page: '1' } }), res);

    expect(tenantService.list).toHaveBeenCalledWith(null, expect.objectContaining({ page: 1 }));
    expect(res.body.data).toHaveLength(1);
  });

  it('returns the selected company through /me', async () => {
    const { controller } = build();
    const req = mockRequest();
    req.tenantId = 't1';
    const res = mockResponse();

    await runHandler(controller.me, req, res);
    expect(res.body.id).toBe('t1');
  });

  it('rejects /me without a selected company', async () => {
    const { controller } = build();
    const req = mockRequest();
    req.tenantId = null;

    expect(await runHandler(controller.me, req, mockResponse())).toBeInstanceOf(UnauthorizedError);
  });

  it('reads and updates the selected company time zone only through context', async () => {
    const { tenantService, controller } = build();
    const req = mockRequest({ body: { timeZone: 'America/Mexico_City' } });
    req.tenantId = 't1';

    await runHandler(controller.timeZone, req, mockResponse());
    expect(tenantService.current).toHaveBeenCalledWith('t1');

    await runHandler(controller.updateTimeZone, req, mockResponse());
    expect(tenantService.updateTimeZone).toHaveBeenCalledWith('t1', 'America/Mexico_City', expect.anything());
  });

  it('creates, updates and removes companies', async () => {
    const { tenantService, controller } = build();

    await runHandler(controller.create, mockRequest({ body: { commercialName: 'New' } }), mockResponse());
    expect(tenantService.create).toHaveBeenCalledWith(null, { commercialName: 'New' }, expect.anything());

    await runHandler(controller.update, mockRequest({ params: { id: 't1' }, body: {} }), mockResponse());
    expect(tenantService.update).toHaveBeenCalled();

    await runHandler(controller.remove, mockRequest({ params: { id: 't1' } }), mockResponse());
    expect(tenantService.remove).toHaveBeenCalled();
  });
});

describe('ApiKeyController', () => {
  function build() {
    const apiKeyService = {
      list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      get: jest.fn().mockResolvedValue({ id: 'k1' }),
      create: jest.fn().mockResolvedValue({ id: 'k2', plaintextKey: 'pg_secret' }),
      update: jest.fn().mockResolvedValue({ id: 'k1' }),
      revoke: jest.fn().mockResolvedValue({ id: 'k1', status: 'revoked' }),
      remove: jest.fn().mockResolvedValue({ id: 'k1', deletedAt: 'x' })
    };
    return { apiKeyService, controller: new ApiKeyController(apiKeyService as any) };
  }

  it('returns the plaintext key only from create', async () => {
    const { controller } = build();
    const req = mockRequest({ body: { name: 'K', scopes: ['products:read'] } });
    req.tenantId = 'tenant-1';
    const res = mockResponse();

    await runHandler(controller.create, req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.plaintextKey).toBe('pg_secret');
  });

  it('revokes a key', async () => {
    const { apiKeyService, controller } = build();
    const req = mockRequest({ params: { id: 'k1' } });
    req.tenantId = 'tenant-1';

    await runHandler(controller.revoke, req, mockResponse());
    expect(apiKeyService.revoke).toHaveBeenCalledWith('tenant-1', 'k1', expect.anything());
  });

  it('lists, reads, updates and deletes keys', async () => {
    const { apiKeyService, controller } = build();
    const req = mockRequest({ params: { id: 'k1' }, body: { name: 'New' } });
    req.tenantId = 'tenant-1';

    await runHandler(controller.list, req, mockResponse());
    await runHandler(controller.get, req, mockResponse());
    await runHandler(controller.update, req, mockResponse());
    await runHandler(controller.remove, req, mockResponse());

    expect(apiKeyService.list).toHaveBeenCalled();
    expect(apiKeyService.get).toHaveBeenCalledWith('tenant-1', 'k1');
    expect(apiKeyService.update).toHaveBeenCalled();
    expect(apiKeyService.remove).toHaveBeenCalled();
  });
});

describe('PriceController', () => {
  function build() {
    const priceService = {
      list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      get: jest.fn().mockResolvedValue({
        id: 'price-1',
        productId: 'prod-1',
        priceListId: 'list-1',
        marketplaceId: 'mkt-1',
        basePrice: 100,
        currencyCode: 'MXN'
      }),
      create: jest.fn().mockResolvedValue({ id: 'price-1' }),
      update: jest.fn().mockResolvedValue({ id: 'price-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'price-1' }),
      preview: jest.fn().mockResolvedValue({ finalPrice: 90, scope: 'product' })
    };
    const priceHistoryService = {
      list: jest.fn().mockResolvedValue({ data: [{ id: 'h1' }], meta: {} })
    };
    return { priceService, priceHistoryService, controller: new PriceController(priceService as any, priceHistoryService as any) };
  }

  it('previews the final price for an unsaved price', async () => {
    const { priceService, controller } = build();
    const req = mockRequest({ body: { basePrice: 100 } });
    req.tenantId = 'tenant-1';
    const res = mockResponse();

    await runHandler(controller.calculate, req, res);

    expect(priceService.preview).toHaveBeenCalledWith('tenant-1', { basePrice: 100 });
    expect(res.body.finalPrice).toBe(90);
  });

  it('recalculates an existing price using its stored references', async () => {
    const { priceService, controller } = build();
    const req = mockRequest({ params: { id: 'price-1' }, body: { basePrice: 250 } });
    req.tenantId = 'tenant-1';

    await runHandler(controller.calculateExisting, req, mockResponse());

    expect(priceService.preview).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ productId: 'prod-1', priceListId: 'list-1', marketplaceId: 'mkt-1', basePrice: 250 })
    );
  });

  it('returns the history of a price scoped by priceId', async () => {
    const { priceHistoryService, controller } = build();
    const req = mockRequest({ params: { id: 'price-1' } });
    req.tenantId = 'tenant-1';
    const res = mockResponse();

    await runHandler(controller.history, req, res);

    expect(priceHistoryService.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ priceId: 'price-1' })
    );
    expect(res.body.data).toHaveLength(1);
  });

  it('performs the standard CRUD operations', async () => {
    const { priceService, controller } = build();
    const req = mockRequest({ params: { id: 'price-1' }, body: {} });
    req.tenantId = 'tenant-1';

    await runHandler(controller.list, req, mockResponse());
    await runHandler(controller.get, req, mockResponse());
    await runHandler(controller.create, req, mockResponse());
    await runHandler(controller.update, req, mockResponse());
    await runHandler(controller.remove, req, mockResponse());

    expect(priceService.create).toHaveBeenCalled();
    expect(priceService.update).toHaveBeenCalled();
    expect(priceService.remove).toHaveBeenCalled();
  });

  it('does not expose history for a price outside the tenant', async () => {
    const { priceService, controller } = build();
    priceService.get.mockRejectedValueOnce(new UnauthorizedError('nope'));
    const req = mockRequest({ params: { id: 'other' } });
    req.tenantId = 'tenant-1';

    const error = await runHandler(controller.history, req, mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe('DashboardController', () => {
  function build() {
    const dashboardService = {
      summary: jest.fn().mockResolvedValue({ activeProducts: 3 }),
      recentPrices: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      pricesByMarketplace: jest.fn().mockResolvedValue([{ marketplaceId: 'm1', priceCount: 2 }])
    };
    return { dashboardService, controller: new DashboardController(dashboardService as any) };
  }

  it('returns the summary, recent prices and chart data', async () => {
    const { dashboardService, controller } = build();
    const req = mockRequest({ query: { limit: '5' } });
    req.tenantId = 'tenant-1';

    const summaryRes = mockResponse();
    await runHandler(controller.summary, req, summaryRes);
    expect(summaryRes.body.activeProducts).toBe(3);

    await runHandler(controller.recentPrices, req, mockResponse());
    expect(dashboardService.recentPrices).toHaveBeenCalledWith('tenant-1', 5);

    await runHandler(controller.pricesByMarketplace, req, mockResponse());
    expect(dashboardService.pricesByMarketplace).toHaveBeenCalledWith('tenant-1');
  });

  it('falls back to the default recent-prices limit', async () => {
    const { dashboardService, controller } = build();
    const req = mockRequest();
    req.tenantId = 'tenant-1';

    await runHandler(controller.recentPrices, req, mockResponse());
    expect(dashboardService.recentPrices).toHaveBeenCalledWith('tenant-1', 8);
  });
});

describe('RoleController', () => {
  it('returns and assigns permission slugs', async () => {
    const roleService = {
      permissions: jest.fn().mockResolvedValue(['products:read']),
      assignPermissions: jest.fn().mockResolvedValue(['products:create'])
    };
    const controller = new RoleController(roleService as any);

    const req = mockRequest({ params: { id: 'role-1' }, body: { permissionSlugs: ['products:create'] } });
    req.tenantId = 'tenant-1';

    const permissionsRes = mockResponse();
    await runHandler(controller.permissions, req, permissionsRes);
    expect(permissionsRes.body).toEqual({ permissionSlugs: ['products:read'] });

    const assignRes = mockResponse();
    await runHandler(controller.assignPermissions, req, assignRes);
    expect(roleService.assignPermissions).toHaveBeenCalledWith('tenant-1', 'role-1', ['products:create'], expect.anything());
    expect(assignRes.body).toEqual({ permissionSlugs: ['products:create'] });
  });

  it('defaults to an empty permission list', async () => {
    const roleService = {
      permissions: jest.fn(),
      assignPermissions: jest.fn().mockResolvedValue([])
    };
    const controller = new RoleController(roleService as any);
    const req = mockRequest({ params: { id: 'role-1' } });
    req.tenantId = 'tenant-1';

    await runHandler(controller.assignPermissions, req, mockResponse());
    expect(roleService.assignPermissions).toHaveBeenCalledWith('tenant-1', 'role-1', [], expect.anything());
  });
});

describe('PriceListController', () => {
  it('sets products and marketplaces', async () => {
    const priceListService = {
      setProducts: jest.fn().mockResolvedValue(['p1']),
      setMarketplaces: jest.fn().mockResolvedValue(['m1'])
    };
    const controller = new PriceListController(priceListService as any);
    const req = mockRequest({ params: { id: 'list-1' }, body: { ids: ['p1'] } });
    req.tenantId = 'tenant-1';

    const productsRes = mockResponse();
    await runHandler(controller.setProducts, req, productsRes);
    expect(productsRes.body).toEqual({ productIds: ['p1'] });

    const marketplacesRes = mockResponse();
    await runHandler(controller.setMarketplaces, req, marketplacesRes);
    expect(marketplacesRes.body).toEqual({ marketplaceIds: ['m1'] });
  });

  it('defaults to empty id lists', async () => {
    const priceListService = {
      setProducts: jest.fn().mockResolvedValue([]),
      setMarketplaces: jest.fn().mockResolvedValue([])
    };
    const controller = new PriceListController(priceListService as any);
    const req = mockRequest({ params: { id: 'list-1' } });
    req.tenantId = 'tenant-1';

    await runHandler(controller.setProducts, req, mockResponse());
    expect(priceListService.setProducts).toHaveBeenCalledWith('tenant-1', 'list-1', [], expect.anything());
  });
});
