import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import {
  CurrencyService,
  DiscountService,
  MarketplaceService,
  PermissionService,
  PriceHistoryService,
  PriceListService,
  ProductService,
  SupplierService,
  UnitOfMeasureService
} from './catalog.services';
import { ApiKeyService, RoleService, TenantService, UserService } from './access.services';
import { PriceService } from './price.service';
import { DashboardService } from './dashboard.service';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';
import { provideTranslocoTesting } from '../../testing';
import type { AuthUser } from '../models';

const API = environment.apiUrl;

function authUser(): AuthUser {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['products:read'],
    preferredLocale: 'es-419'
  };
}

describe('catalog services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists products with query parameters', () => {
    const service = TestBed.inject(ProductService);
    service.list({ page: 2, limit: 10, search: 'tv', status: 'active', sort: 'name', order: 'asc' }).subscribe();

    const request = http.expectOne((req) => req.url === `${API}/products`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('search')).toBe('tv');
    expect(request.request.params.get('order')).toBe('asc');
    request.flush({ data: [], meta: {} });
  });

  it('omits empty query parameters', () => {
    const service = TestBed.inject(ProductService);
    service.list({ page: 1, search: '', status: undefined }).subscribe();

    const request = http.expectOne((req) => req.url === `${API}/products`);
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    request.flush({ data: [], meta: {} });
  });

  it('requests only active units of one dimension', () => {
    const service = TestBed.inject(UnitOfMeasureService);
    service.byDimension('mass').subscribe();

    const request = http.expectOne((req) => req.url === `${API}/units-of-measure`);
    expect(request.request.params.get('dimension')).toBe('mass');
    expect(request.request.params.get('status')).toBe('active');
    request.flush({ data: [], meta: {} });
  });

  it('follows every page of the active unit catalog', () => {
    const service = TestBed.inject(UnitOfMeasureService);
    let codes: string[] = [];
    service.allActive().subscribe((units) => (codes = units.map((unit) => unit.code)));

    // The generic list caps a page at 100 rows, so a catalog that outgrows one
    // page must still be delivered complete to the pickers.
    const first = http.expectOne(
      (req) => req.url === `${API}/units-of-measure` && req.params.get('page') === '1'
    );
    expect(first.request.params.get('status')).toBe('active');
    first.flush({
      data: [{ id: 'u1', code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimals: 0, status: 'active' }],
      meta: { page: 1, limit: 100, total: 2, totalPages: 2 }
    });

    const second = http.expectOne(
      (req) => req.url === `${API}/units-of-measure` && req.params.get('page') === '2'
    );
    second.flush({
      data: [{ id: 'u2', code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'mass', decimals: 3, status: 'active' }],
      meta: { page: 2, limit: 100, total: 2, totalPages: 2 }
    });

    expect(codes).toEqual(['EA', 'KG']);
  });

  it('queries suppliers with a search term', () => {
    const service = TestBed.inject(SupplierService);
    service.list({ search: 'nor', status: 'active', limit: 20 }).subscribe();

    const request = http.expectOne((req) => req.url === `${API}/suppliers`);
    expect(request.request.params.get('search')).toBe('nor');
    request.flush({ data: [], meta: {} });
  });

  it('performs the CRUD verbs', () => {
    const service = TestBed.inject(ProductService);

    service.get('p1').subscribe();
    http.expectOne(`${API}/products/p1`).flush({});

    service.create({ sku: 'A' }).subscribe();
    const created = http.expectOne(`${API}/products`);
    expect(created.request.method).toBe('POST');
    created.flush({});

    service.update('p1', { sku: 'B' }).subscribe();
    const updated = http.expectOne(`${API}/products/p1`);
    expect(updated.request.method).toBe('PATCH');
    updated.flush({});

    service.remove('p1').subscribe();
    const removed = http.expectOne(`${API}/products/p1`);
    expect(removed.request.method).toBe('DELETE');
    removed.flush({});
  });

  it('exposes marketplace, discount, price-list and permission services', () => {
    TestBed.inject(MarketplaceService).list().subscribe();
    http.expectOne(`${API}/marketplaces`).flush({ data: [], meta: {} });

    TestBed.inject(DiscountService).list().subscribe();
    http.expectOne(`${API}/discounts`).flush({ data: [], meta: {} });

    TestBed.inject(PriceHistoryService).list().subscribe();
    http.expectOne(`${API}/price-history`).flush({ data: [], meta: {} });

    TestBed.inject(PermissionService).list().subscribe();
    http.expectOne(`${API}/permissions`).flush({ data: [], meta: {} });

    const priceLists = TestBed.inject(PriceListService);
    priceLists.list().subscribe();
    http.expectOne(`${API}/price-lists`).flush({ data: [], meta: {} });
  });

  it('replaces the price-list relations', () => {
    const service = TestBed.inject(PriceListService);

    service.setProducts('l1', ['p1']).subscribe();
    const products = http.expectOne(`${API}/price-lists/l1/products`);
    expect(products.request.method).toBe('PUT');
    expect(products.request.body).toEqual({ ids: ['p1'] });
    products.flush({ productIds: ['p1'] });

    service.setMarketplaces('l1', ['m1']).subscribe();
    const marketplaces = http.expectOne(`${API}/price-lists/l1/marketplaces`);
    expect(marketplaces.request.body).toEqual({ ids: ['m1'] });
    marketplaces.flush({ marketplaceIds: ['m1'] });
  });

  it('reads currencies by code', () => {
    const service = TestBed.inject(CurrencyService);
    let code = '';
    service.byCode('MXN').subscribe((currency) => (code = currency.code));

    http.expectOne(`${API}/currencies/MXN`).flush({ code: 'MXN' });
    expect(code).toBe('MXN');
  });
});

describe('price service', () => {
  let http: HttpTestingController;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('previews the final price', () => {
    const service = TestBed.inject(PriceService);
    service
      .calculate({
        productId: 'p1',
        priceListId: 'l1',
        marketplaceId: 'm1',
        basePrice: 100,
        currencyCode: 'MXN'
      })
      .subscribe();

    const request = http.expectOne(`${API}/prices/calculate`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.basePrice).toBe(100);
    request.flush({ finalPrice: 90 });
  });

  it('recalculates an existing price', () => {
    const service = TestBed.inject(PriceService);
    service.recalculate('price-1', { basePrice: 200 }).subscribe();

    const request = http.expectOne(`${API}/prices/price-1/calculate`);
    expect(request.request.method).toBe('POST');
    request.flush({ finalPrice: 180 });
  });

  it('reads the price history', () => {
    const service = TestBed.inject(PriceService);
    service.history('price-1', { page: 1 }).subscribe();

    http.expectOne((req) => req.url === `${API}/prices/price-1/history`).flush({ data: [], meta: {} });
  });
});

describe('access services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the current company', () => {
    TestBed.inject(TenantService).me().subscribe();
    http.expectOne(`${API}/tenants/me`).flush({ id: 't1' });
  });

  it('reads and updates the current company time zone', () => {
    const service = TestBed.inject(TenantService);

    service.timeZone().subscribe();
    http.expectOne(`${API}/tenants/me/time-zone`).flush({ timeZone: 'UTC' });

    service.updateTimeZone('America/Mexico_City').subscribe();
    const request = http.expectOne(`${API}/tenants/me/time-zone`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ timeZone: 'America/Mexico_City' });
    request.flush({ timeZone: 'America/Mexico_City' });
  });

  it('lists users', () => {
    TestBed.inject(UserService).list().subscribe();
    http.expectOne(`${API}/users`).flush({ data: [], meta: {} });
  });

  it('reads and assigns role permissions', () => {
    const service = TestBed.inject(RoleService);

    service.permissions('r1').subscribe();
    http.expectOne(`${API}/roles/r1/permissions`).flush({ permissionSlugs: [] });

    service.assignPermissions('r1', ['products:read']).subscribe();
    const assign = http.expectOne(`${API}/roles/r1/permissions`);
    expect(assign.request.method).toBe('PUT');
    expect(assign.request.body).toEqual({ permissionSlugs: ['products:read'] });
    assign.flush({ permissionSlugs: ['products:read'] });
  });

  it('creates and revokes API keys', () => {
    const service = TestBed.inject(ApiKeyService);

    service.create({ name: 'K', scopes: ['products:read'] }).subscribe();
    const created = http.expectOne(`${API}/api-keys`);
    expect(created.request.method).toBe('POST');
    created.flush({ id: 'k1', plaintextKey: 'pg_x' });

    service.revoke('k1').subscribe();
    const revoked = http.expectOne(`${API}/api-keys/k1/revoke`);
    expect(revoked.request.method).toBe('POST');
    revoked.flush({ id: 'k1', status: 'revoked' });
  });
});

describe('dashboard service', () => {
  let http: HttpTestingController;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the summary, recent prices and chart data', () => {
    const service = TestBed.inject(DashboardService);

    service.summary().subscribe();
    http.expectOne(`${API}/dashboard/summary`).flush({ activeProducts: 1 });

    service.recentPrices(5).subscribe();
    const recent = http.expectOne((req) => req.url === `${API}/dashboard/recent-prices`);
    expect(recent.request.params.get('limit')).toBe('5');
    recent.flush([]);

    service.pricesByMarketplace().subscribe();
    http.expectOne(`${API}/dashboard/prices-by-marketplace`).flush([]);
  });
});

describe('auth service', () => {
  let http: HttpTestingController;
  let service: AuthService;
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  afterEach(() => http.verify());

  it('logs in and stores the session', () => {
    let user: AuthUser | undefined;
    service.login('admin@example.com', 'secret').subscribe((response) => (user = response.user));

    const request = http.expectOne(`${API}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'admin@example.com', password: 'secret' });
    request.flush({ accessToken: 'token-1', user: authUser() });

    expect(user?.id).toBe('user-1');
    expect(session.accessToken()).toBe('token-1');
    expect(session.isAuthenticated()).toBe(true);
  });

  it('refreshes and replaces the session', () => {
    service.refresh().subscribe();

    http.expectOne(`${API}/auth/refresh`).flush({ accessToken: 'token-2', user: authUser() });
    expect(session.accessToken()).toBe('token-2');
  });

  it('logs out and clears the session', () => {
    session.setSession('token-1', authUser());

    service.logout().subscribe();
    http.expectOne(`${API}/auth/logout`).flush(null);

    expect(session.isAuthenticated()).toBe(false);
  });

  it('still clears the session when logout fails', () => {
    session.setSession('token-1', authUser());

    service.logout().subscribe({ error: () => undefined });
    http
      .expectOne(`${API}/auth/logout`)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(session.isAuthenticated()).toBe(false);
  });

  it('loads the current user', () => {
    service.me().subscribe();

    http.expectOne(`${API}/auth/me`).flush(authUser());
    expect(session.user()?.id).toBe('user-1');
  });
});
