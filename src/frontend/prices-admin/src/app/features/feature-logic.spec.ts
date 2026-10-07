import { TestBed } from '@angular/core/testing';
import { hasCatalogKey, installTestTranslations, provideTranslocoTesting } from '../testing';
import { provideRouter } from '@angular/router';
import { FormControl, FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { PricesComponent } from './prices/prices.component';
import { DiscountsComponent } from './discounts/discounts.component';
import { ApiKeysComponent } from './api-keys/api-keys.component';
import { RolesComponent } from './roles/roles.component';
import {
  CurrencyService,
  DiscountService,
  MarketplaceService,
  PermissionService,
  PriceHistoryService,
  PriceListService,
  ProductService
} from '../core/services/catalog.services';
import { ApiKeyService, RoleService, TenantService, UserService } from '../core/services/access.services';
import { PriceService } from '../core/services/price.service';
import { SessionStore } from '../core/services/session.store';
import { ToastService } from '../core/services/toast.service';
import type { AuthUser } from '../core/models';

function authUser(permissions: string[] = []): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions,
    preferredLocale: 'es-419'
  };
}

const page = (rows: any[] = []) =>
  of({ data: rows, meta: { page: 1, limit: 100, total: rows.length, totalPages: 1 } });

function resource(rows: any[] = []) {
  return {
    list: jasmine.createSpy('list').and.returnValue(page(rows)),
    get: jasmine.createSpy('get').and.returnValue(of({})),
    create: jasmine.createSpy('create').and.returnValue(of({})),
    update: jasmine.createSpy('update').and.returnValue(of({})),
    remove: jasmine.createSpy('remove').and.returnValue(of({}))
  };
}

const noopToast = () => ({
  success: jasmine.createSpy('success'),
  error: jasmine.createSpy('error'),
  info: jasmine.createSpy('info'),
  dismiss: jasmine.createSpy('dismiss'),
  clear: jasmine.createSpy('clear'),
  toasts: () => []
});

describe('PricesComponent logic', () => {
  let component: PricesComponent;
  let priceService: any;

  beforeEach(async () => {
  window.localStorage.clear();
    priceService = {
      ...resource(),
      calculate: jasmine.createSpy('calculate').and.returnValue(
        of({
          basePrice: 100,
          finalPrice: 90,
          discountAmount: 10,
          scope: 'product',
          appliedDiscount: { id: 'd1', name: 'Verano', type: 'percentage', value: 10, appliesTo: 'product', priority: 1 }
        })
      )
    };

    await TestBed.configureTestingModule({
      imports: [PricesComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: PriceService, useValue: priceService },
        { provide: ProductService, useValue: resource([{ id: 'p1', sku: 'SKU-1', name: 'Cafetera' }]) },
        { provide: PriceListService, useValue: resource([{ id: 'l1', name: 'Retail' }]) },
        { provide: MarketplaceService, useValue: resource([{ id: 'm1', name: 'Amazon' }]) },
        { provide: CurrencyService, useValue: resource() },
        { provide: ToastService, useValue: noopToast() }
      ]
    }).compileComponents();
    installTestTranslations();

    const fixture = TestBed.createComponent(PricesComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('maps an API price into form values', () => {
    const values = component.mapToForm({
      productId: 'p1',
      priceListId: 'l1',
      marketplaceId: 'm1',
      basePrice: 100,
      currencyCode: 'MXN',
      startDate: '2024-01-01T12:00:00',
      endDate: null,
      status: 'active',
      notes: null
    });

    expect(values['productId']).toBe('p1');
    expect(values['startDate']).toBe('2024-01-01');
    expect(values['endDate']).toBe('');
    expect(values['currencyCode']).toBe('MXN');
  });

  it('converts form values back into an API payload on create', () => {
    const payload = component.mapToPayload(
      {
        productId: 'p1',
        priceListId: 'l1',
        marketplaceId: 'm1',
        startDate: '2024-01-01',
        endDate: '',
        basePrice: 10
      },
      { isEditing: false }
    );

    expect(payload['startDate']).toBe('2024-01-01');
    expect(payload['endDate']).toBeNull();
    // References are required to create a price.
    expect(payload['productId']).toBe('p1');
    expect(payload['priceListId']).toBe('l1');
    expect(payload['marketplaceId']).toBe('m1');
  });

  it('drops the immutable references on update (the API rejects them)', () => {
    const payload = component.mapToPayload(
      { productId: 'p1', priceListId: 'l1', marketplaceId: 'm1', basePrice: 20 },
      { isEditing: true }
    );

    expect(payload['productId']).toBeUndefined();
    expect(payload['priceListId']).toBeUndefined();
    expect(payload['marketplaceId']).toBeUndefined();
    expect(payload['basePrice']).toBe(20);
  });

  it('keeps a provided end date in the payload', () => {
    const payload = component.mapToPayload(
      { startDate: '2024-01-01', endDate: '2024-02-01' },
      { isEditing: false }
    );
    expect(payload['endDate']).toBe('2024-02-01');
  });

  it('builds preview results including the applied discount', (done) => {
    component
      .previewRunner({
        productId: 'p1',
        priceListId: 'l1',
        marketplaceId: 'm1',
        basePrice: 100,
        currencyCode: 'MXN'
      })
      .subscribe((results) => {
        // Labels are catalog keys resolved while rendering, not frozen strings.
        expect(results.map((result) => result.label)).toEqual([
          { key: 'prices.preview.basePrice' },
          { key: 'prices.preview.discount' },
          { key: 'prices.preview.finalPrice' }
        ]);
        // The discount name is business data, so it stays literal.
        expect(results[1].value).toEqual({ text: 'Verano' });
        // The hint is a complete translated sentence with parameters.
        expect(results[1].hint).toEqual({
          key: 'prices.preview.discountHint',
          params: { scope: 'Producto', amount: jasmine.any(String) }
        });
        done();
      });
  });

  it('reports when no discount applies', (done) => {
    priceService.calculate.and.returnValue(
      of({ basePrice: 100, finalPrice: 100, discountAmount: 0, scope: 'base', appliedDiscount: null })
    );

    component
      .previewRunner({ productId: 'p1', priceListId: 'l1', marketplaceId: 'm1', basePrice: 100, currencyCode: 'MXN' })
      .subscribe((results) => {
        expect(results[1].value).toEqual({ key: 'prices.preview.none' });
        expect(results[1].hint).toEqual({ key: 'prices.preview.basePriceUsed' });
        done();
      });
  });

  it('uses safe defaults for missing preview values', (done) => {
    component.previewRunner({}).subscribe(() => {
      expect(priceService.calculate).toHaveBeenCalledWith(
        jasmine.objectContaining({ basePrice: 0, currencyCode: 'MXN' })
      );
      done();
    });
  });

  it('queries the product source by term and maps SKU and name', (done) => {
    const products = TestBed.inject(ProductService) as any;

    component.asyncSelectSources['products']('cafe').subscribe((result) => {
      // The catalog is never preloaded: the source is query-aware and asks the
      // API only for active products matching the term.
      expect(products.list).toHaveBeenCalledWith({
        search: 'cafe',
        status: 'active',
        page: 1,
        limit: 30
      });
      // SKU and name are business data, so the label is a literal.
      expect(result).toEqual({ data: [{ value: 'p1', label: { text: 'SKU-1 — Cafetera' } }] });
      done();
    });
  });

  it('resolves the linked product label for the edit modal from the row', () => {
    const field = component.fields.find((candidate) => candidate.key === 'productId');

    expect(
      field?.initialOption?.({ productId: 'p9', product: { id: 'p9', sku: 'SKU-9', name: 'Antiguo' } })
    ).toEqual({ value: 'p9', label: { text: 'SKU-9 — Antiguo' } });

    // No included product (or no product at all) degrades to no label.
    expect(field?.initialOption?.({ productId: 'p9' })).toBeNull();
    expect(field?.initialOption?.({})).toBeNull();
  });

  it('builds the remaining select sources', (done) => {
    component.selectSources.priceLists().subscribe((options) => {
      expect(options[0].value).toBe('l1');
      component.selectSources.marketplaces().subscribe((marketplaces) => {
        expect(marketplaces[0].value).toBe('m1');
        component.selectSources.currencies().subscribe((currencies) => {
          expect(Array.isArray(currencies)).toBe(true);
          // Only the product field became an autocomplete: the other references
          // keep their eager select sources.
          expect(
            (component.selectSources as Record<string, unknown>)['products']
          ).toBeUndefined();
          done();
        });
      });
    });
  });

  it('exposes the permission helper', () => {
    const session = TestBed.inject(SessionStore);
    session.setSession('token', authUser(['prices:create']));

    expect(component.can('prices:create')).toBe(true);
    expect(component.can('prices:delete')).toBe(false);
  });
});

describe('DiscountsComponent logic', () => {
  let component: DiscountsComponent;

  beforeEach(async () => {
  window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DiscountsComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: DiscountService, useValue: resource() },
        { provide: ProductService, useValue: resource([{ id: 'p1', name: 'Cafetera' }]) },
        { provide: PriceListService, useValue: resource([{ id: 'l1', name: 'Retail' }]) },
        { provide: MarketplaceService, useValue: resource([{ id: 'm1', name: 'Amazon' }]) },
        { provide: ToastService, useValue: noopToast() }
      ]
    }).compileComponents();
    installTestTranslations();

    const fixture = TestBed.createComponent(DiscountsComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  function formFor(values: Record<string, unknown>): FormGroup {
    const controls: Record<string, FormControl> = {};
    for (const [key, value] of Object.entries(values)) controls[key] = new FormControl(value);
    return new FormGroup(controls);
  }

  const baseValues = {
    name: 'Verano',
    type: 'percentage',
    value: 10,
    appliesTo: 'product',
    productId: 'p1',
    priceListId: '',
    marketplaceId: '',
    startDate: '2024-01-01',
    endDate: ''
  };

  it('maps an API discount into form values', () => {
    const values = component.mapToForm({
      name: 'Verano',
      type: 'fixed',
      value: 50,
      appliesTo: 'price_list',
      priceListId: 'l1',
      startDate: '2024-01-01T12:00:00',
      endDate: '2024-02-01T12:00:00',
      priority: 5,
      status: 'active',
      description: null
    });

    expect(values['appliesTo']).toBe('price_list');
    expect(values['startDate']).toBe('2024-01-01');
    expect(values['endDate']).toBe('2024-02-01');
    expect(values['priority']).toBe(5);
  });

  it('serialises the payload with the matching scope reference only', () => {
    const payload = component.mapToPayload({
      name: 'Verano',
      type: 'percentage',
      value: '10',
      appliesTo: 'marketplace',
      productId: 'p1',
      priceListId: 'l1',
      marketplaceId: 'm1',
      startDate: '2024-01-01',
      endDate: '',
      priority: '7',
      status: 'active',
      description: ''
    });

    expect(payload['productId']).toBeNull();
    expect(payload['priceListId']).toBeNull();
    expect(payload['marketplaceId']).toBe('m1');
    expect(payload['priority']).toBe(7);
    expect(payload['endDate']).toBeNull();
    expect(payload['description']).toBeNull();
  });

  it('defaults the payload values defensively', () => {
    const payload = component.mapToPayload({ appliesTo: 'product' });

    expect(payload['value']).toBe(0);
    expect(payload['priority']).toBe(100);
    expect(payload['startDate']).toBeNull();
  });

  it('maps the active toggle to the status enum', () => {
    const active = component.mapToPayload({ appliesTo: 'product', status: true });
    const inactive = component.mapToPayload({ appliesTo: 'product', status: false });

    expect(active['status']).toBe('active');
    expect(inactive['status']).toBe('inactive');
  });

  it('turns the status enum into the toggle boolean', () => {
    expect(component.mapToForm({ status: 'active' })['status']).toBe(true);
    expect(component.mapToForm({ status: 'inactive' })['status']).toBe(false);
    expect(component.mapToForm({})['status']).toBe(true);
  });

  it('accepts a valid discount', () => {
    const validator = component.crossValidators[0];
    expect(validator(formFor(baseValues))).toBeNull();
  });

  it('requires the scope reference matching appliesTo', () => {
    const validator = component.crossValidators[0];
    const errors = validator(formFor({ ...baseValues, productId: '' }));

    // Cross-field messages are catalog keys; CrudPageComponent resolves them so
    // the copy follows a runtime language switch.
    expect(errors!['zod']['productId']).toBe('discounts.validation.scopeRequired');
  });

  it('rejects scope references that do not match appliesTo', () => {
    const validator = component.crossValidators[0];
    const errors = validator(formFor({ ...baseValues, priceListId: 'l1' }));

    expect(errors!['zod']['priceListId']).toBe('discounts.validation.scopeNotApplicable');
  });

  it('rejects a percentage above 100', () => {
    const validator = component.crossValidators[0];
    const errors = validator(formFor({ ...baseValues, value: 150 }));

    expect(errors!['zod']['value']).toBe('discounts.validation.percentageMax');
  });

  it('rejects an end date before the start date', () => {
    const validator = component.crossValidators[0];
    const errors = validator(formFor({ ...baseValues, endDate: '2023-12-01' }));

    expect(errors!['zod']['endDate']).toBe('discounts.validation.endAfterStart');
  });

  it('every cross-field message resolves in both catalogs', () => {
    const validator = component.crossValidators[0];
    const keys = [
      validator(formFor({ ...baseValues, productId: '' }))!['zod']['productId'],
      validator(formFor({ ...baseValues, priceListId: 'l1' }))!['zod']['priceListId'],
      validator(formFor({ ...baseValues, value: 150 }))!['zod']['value'],
      validator(formFor({ ...baseValues, endDate: '2023-12-01' }))!['zod']['endDate']
    ];

    for (const key of keys) {
      expect(hasCatalogKey('es-419', key)).withContext(`es-419.${key}`).toBe(true);
      expect(hasCatalogKey('en-US', key)).withContext(`en-US.${key}`).toBe(true);
    }
  });

  it('validates a price-list scoped discount', () => {
    const validator = component.crossValidators[0];
    const errors = validator(
      formFor({ ...baseValues, appliesTo: 'price_list', productId: '', priceListId: 'l1' })
    );

    expect(errors).toBeNull();
  });

  it('validates a marketplace scoped discount', () => {
    const validator = component.crossValidators[0];
    const errors = validator(
      formFor({ ...baseValues, appliesTo: 'marketplace', productId: '', marketplaceId: 'm1' })
    );

    expect(errors).toBeNull();
  });

  it('builds the select sources', (done) => {
    component.selectSources.products().subscribe((options) => {
      expect(options[0].value).toBe('p1');
      done();
    });
  });
});

describe('ApiKeysComponent logic', () => {
  let component: ApiKeysComponent;
  let apiKeyService: any;
  let toast: any;

  beforeEach(async () => {
  window.localStorage.clear();
    apiKeyService = { ...resource(), revoke: jasmine.createSpy('revoke').and.returnValue(of({ status: 'revoked' })) };
    toast = noopToast();

    await TestBed.configureTestingModule({
      imports: [ApiKeysComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: ApiKeyService, useValue: apiKeyService },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
    installTestTranslations();

    const fixture = TestBed.createComponent(ApiKeysComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('maps an API key into form values', () => {
    const values = component.mapToForm({ name: 'Integración', scopes: ['prices:read'], expiresAt: null });

    expect(values['name']).toBe('Integración');
    expect(values['scope']).toBe('prices:read');
    expect(values['expiresAt']).toBe('');
  });

  it('falls back when the scopes array is missing', () => {
    const values = component.mapToForm({ name: 'Sin scopes' });
    expect(values['scope']).toBe('products:read');
  });

  it('serialises the payload with a scopes array', () => {
    const payload = component.mapToPayload({ name: 'K', scope: 'prices:read', expiresAt: '2025-01-01' });

    expect(payload['scopes']).toEqual(['prices:read']);
    expect(payload['expiresAt']).toBe(new Date('2025-01-01').toISOString());
  });

  it('omits the expiry when empty', () => {
    const payload = component.mapToPayload({ name: 'K', scope: 'prices:read', expiresAt: '' });
    expect(payload['expiresAt']).toBeNull();
  });

  it('offers revocation only for non-revoked keys', () => {
    expect(component.rowActions[0].visible!({ effectiveStatus: 'active' })).toBe(true);
    expect(component.rowActions[0].visible!({ effectiveStatus: 'expired' })).toBe(true);
    expect(component.rowActions[0].visible!({ effectiveStatus: 'revoked' })).toBe(false);
  });

  it('revokes a key and reports success', () => {
    component.rowActions[0].run({ id: 'k1', effectiveStatus: 'active' });

    expect(apiKeyService.revoke).toHaveBeenCalledWith('k1');
    expect(toast.success).toHaveBeenCalled();
  });

  it('reports revocation failures', () => {
    apiKeyService.revoke.and.returnValue(throwError(() => ({ error: { message: 'No autorizado' } })));

    component.rowActions[0].run({ id: 'k1', effectiveStatus: 'active' });

    expect(toast.error).toHaveBeenCalledWith('No autorizado');
  });
});

describe('RolesComponent logic', () => {
  let component: RolesComponent;
  let roleService: any;
  let permissionService: any;
  let toast: any;

  beforeEach(async () => {
  window.localStorage.clear();
    roleService = {
      ...resource(),
      permissions: jasmine.createSpy('permissions').and.returnValue(of({ permissionSlugs: ['products:read'] })),
      assignPermissions: jasmine
        .createSpy('assignPermissions')
        .and.returnValue(of({ permissionSlugs: ['products:read', 'prices:read'] }))
    };
    permissionService = resource([
      { id: 'perm-1', slug: 'products:read', name: 'Read products', description: 'Ver productos' },
      { id: 'perm-2', slug: 'prices:read', name: 'Read prices', description: null }
    ]);
    toast = noopToast();

    await TestBed.configureTestingModule({
      imports: [RolesComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: RoleService, useValue: roleService },
        { provide: PermissionService, useValue: permissionService },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
    installTestTranslations();

    const fixture = TestBed.createComponent(RolesComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('opens the permissions modal and preloads the assigned slugs', () => {
    component.openPermissions({ id: 'r1', name: 'Analista' } as any);

    expect(component.permissionsOpen()).toBe(true);
    expect(component.selectedRole()?.name).toBe('Analista');
    expect(component.allPermissions().length).toBe(2);
    expect(component.selectedSlugs()).toEqual(['products:read']);
    expect(component.isSelected('products:read')).toBe(true);
    expect(component.isSelected('prices:read')).toBe(false);
  });

  it('toggles permissions on and off', () => {
    component.openPermissions({ id: 'r1', name: 'Analista' } as any);

    component.togglePermission('prices:read');
    expect(component.selectedSlugs()).toContain('prices:read');

    component.togglePermission('prices:read');
    expect(component.selectedSlugs()).not.toContain('prices:read');
  });

  it('saves the permission assignment', () => {
    component.openPermissions({ id: 'r1', name: 'Analista' } as any);
    component.togglePermission('prices:read');
    component.savePermissions();

    expect(roleService.assignPermissions).toHaveBeenCalledWith('r1', ['products:read', 'prices:read']);
    expect(toast.success).toHaveBeenCalled();
    expect(component.permissionsOpen()).toBe(false);
  });

  it('does nothing when saving without a selected role', () => {
    component.savePermissions();
    expect(roleService.assignPermissions).not.toHaveBeenCalled();
  });

  it('reports assignment failures', () => {
    roleService.assignPermissions.and.returnValue(throwError(() => ({ error: { message: 'Sin permiso' } })));
    component.openPermissions({ id: 'r1', name: 'Analista' } as any);
    component.savePermissions();

    expect(toast.error).toHaveBeenCalledWith('Sin permiso');
  });

  it('handles a permission catalog failure', () => {
    permissionService.list.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));

    component.openPermissions({ id: 'r2', name: 'Otro' } as any);

    expect(component.loadingPermissions()).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('degrades gracefully when role permissions cannot be read', () => {
    roleService.permissions.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));

    component.openPermissions({ id: 'r3', name: 'Tercero' } as any);

    expect(component.selectedSlugs()).toEqual([]);
    expect(component.loadingPermissions()).toBe(false);
  });

  it('closes the modal', () => {
    component.openPermissions({ id: 'r1', name: 'Analista' } as any);
    component.closePermissions();

    expect(component.permissionsOpen()).toBe(false);
    expect(component.selectedRole()).toBeNull();
  });

  it('uses the session permission for the row action visibility', () => {
    const session = TestBed.inject(SessionStore);
    expect(component.rowActions[0].visible!({})).toBe(false);

    session.setSession('token', authUser(['roles:assign-permissions']));
    expect(component.rowActions[0].visible!({})).toBe(true);
  });

  it('exposes the humanize helper', () => {
    expect(component.humanize('products:read')).toBe('Products:read');
  });
});
