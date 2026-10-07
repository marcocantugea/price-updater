import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { installTestTranslations, provideTranslocoTesting } from '../testing';
import { importProvidersFrom } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LucideAngularModule } from 'lucide-angular';
import { of, throwError } from 'rxjs';
import { APP_ICONS } from '../core/icons';
import { LoginComponent } from './auth/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ProductsComponent } from './products/products.component';
import { MarketplacesComponent } from './marketplaces/marketplaces.component';
import { PriceListsComponent } from './price-lists/price-lists.component';
import { PricesComponent } from './prices/prices.component';
import { DiscountsComponent } from './discounts/discounts.component';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { ApiKeysComponent } from './api-keys/api-keys.component';
import { UsersComponent } from './users/users.component';
import { RolesComponent } from './roles/roles.component';
import { CompaniesComponent } from './companies/companies.component';
import { SettingsComponent } from './settings/settings.component';
import { AuthService } from '../core/services/auth.service';
import { DashboardService } from '../core/services/dashboard.service';
import { SessionStore } from '../core/services/session.store';
import { LanguageService } from '../core/i18n/language.service';
import { DisplayTextService } from '../core/i18n/display-text.service';
import { LocaleFormattingService } from '../core/i18n/locale-formatting.service';
import { ToastService } from '../core/services/toast.service';
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
import type { AuthUser } from '../core/models';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['products:read'],
    preferredLocale: 'es-419',
    ...overrides
  };
}

const emptyPage = () => of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });

/** Lucide icons are registered globally by app.config; tests must do the same. */
const iconProviders = importProvidersFrom(LucideAngularModule.pick(APP_ICONS));

function resourceStub() {
  return {
    list: jasmine.createSpy('list').and.callFake(emptyPage),
    get: jasmine.createSpy('get').and.returnValue(of({})),
    create: jasmine.createSpy('create').and.returnValue(of({})),
    update: jasmine.createSpy('update').and.returnValue(of({})),
    remove: jasmine.createSpy('remove').and.returnValue(of({}))
  };
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let authService: { login: jasmine.Spy };
  let router: Router;

  beforeEach(async () => {
  window.localStorage.clear();
    authService = { login: jasmine.createSpy('login') };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, provideTranslocoTesting()],
      providers: [provideRouter([]), iconProviders, { provide: AuthService, useValue: authService }]
    }).compileComponents();
    installTestTranslations();

    fixture = TestBed.createComponent(LoginComponent);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  function fill(email: string, password: string): void {
    fixture.componentInstance.form.setValue({ email, password });
  }

  it('renders the login form', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="login-form"]')).toBeTruthy();
    expect((fixture.nativeElement.textContent as string)).toContain('Gestión de precios y catálogos en canales de venta');
  });

  it('validates the email and password before submitting', () => {
    fill('not-an-email', '');
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(authService.login).not.toHaveBeenCalled();
    expect((fixture.nativeElement.textContent as string)).toContain('correo válido');
  });

  it('logs in and navigates to the dashboard', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    authService.login.and.returnValue(of({ accessToken: 'token-1', user: authUser() }));

    fill('admin@example.com', 'secret');
    fixture.componentInstance.submit();

    expect(authService.login).toHaveBeenCalledWith('admin@example.com', 'secret');
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows the API error message when the login fails', () => {
    authService.login.and.returnValue(throwError(() => ({ error: { message: 'Credenciales inválidas' } })));

    fill('admin@example.com', 'wrong');
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="login-error"]').textContent).toContain(
      'Credenciales inválidas'
    );
  });

  it('flags invalid controls after touching', () => {
    expect(fixture.componentInstance.invalid('email')).toBe(false);
    fixture.componentInstance.form.get('email')?.markAsTouched();
    expect(fixture.componentInstance.invalid('email')).toBe(true);
  });
});

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardService: {
    summary: jasmine.Spy;
    recentPrices: jasmine.Spy;
    pricesByMarketplace: jasmine.Spy;
  };

  beforeEach(async () => {
  window.localStorage.clear();
    dashboardService = {
      summary: jasmine.createSpy('summary').and.returnValue(
        of({
          activeProducts: 3,
          marketplaces: 2,
          priceLists: 1,
          activePrices: 5,
          expiringWindowDays: 30,
          expiringDiscounts: [
            { id: 'd1', name: 'Verano', endDate: '2024-07-01', type: 'percentage', value: 10 }
          ]
        })
      ),
      recentPrices: jasmine.createSpy('recentPrices').and.returnValue(
        of([
          {
            id: 'price-1',
            basePrice: 100,
            finalPrice: 90,
            currencyCode: 'MXN',
            status: 'active',
            product: { name: 'Cafetera', sku: 'SKU-1' },
            priceList: { name: 'Retail' },
            marketplace: { name: 'Amazon' }
          }
        ])
      ),
      pricesByMarketplace: jasmine
        .createSpy('pricesByMarketplace')
        .and.returnValue(of([{ marketplaceId: 'm1', name: 'Amazon', code: 'amazon', priceCount: 4, averageFinalPrice: 100 }]))
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        iconProviders,
        { provide: DashboardService, useValue: dashboardService }
      ]
    }).compileComponents();
    installTestTranslations();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('renders the summary metrics', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="metric-products"]').textContent).toContain('3');
    expect(fixture.nativeElement.querySelector('[data-testid="metric-marketplaces"]').textContent).toContain('2');
    expect(fixture.nativeElement.querySelector('[data-testid="metric-price-lists"]').textContent).toContain('1');
    expect(fixture.nativeElement.querySelector('[data-testid="metric-prices"]').textContent).toContain('5');
  });

  it('renders expiring discount alerts and recent prices', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="expiring-alerts"]').textContent).toContain('Verano');
    expect(fixture.nativeElement.querySelector('[data-testid="recent-prices-table"]').textContent).toContain('Cafetera');
  });

  it('renders the marketplace chart with the ngx-charts series', () => {
    const chart = fixture.nativeElement.querySelector('[data-testid="chart"]');
    expect(chart).toBeTruthy();
    expect(chart.querySelector('ngx-charts-bar-vertical')).toBeTruthy();
    expect(fixture.componentInstance.chartData()).toEqual([{ name: 'Amazon', value: 4 }]);
    expect(fixture.componentInstance.barHeight({ priceCount: 4 } as any)).toBe('100%');
  });

  it('reports the number of expiring discounts', () => {
    expect(fixture.componentInstance.expiringCount()).toBe(1);
  });

  it('shows the error state when the summary fails', () => {
    dashboardService.summary.and.returnValue(throwError(() => ({ error: { message: 'Sin conexión' } })));

    const errorFixture = TestBed.createComponent(DashboardComponent);
    errorFixture.detectChanges();

    expect(errorFixture.nativeElement.querySelector('[data-state="error"]')).toBeTruthy();
    expect(errorFixture.nativeElement.textContent).toContain('Sin conexión');
  });
});

describe('module pages', () => {
  async function build<T>(component: any, providers: any[]): Promise<ComponentFixture<T>> {
    await TestBed.configureTestingModule({
      imports: [component, provideTranslocoTesting()],
      providers: [provideRouter([]), iconProviders, ...providers]
    }).compileComponents();
    installTestTranslations();

    const fixture = TestBed.createComponent<T>(component);
    fixture.detectChanges();
    return fixture;
  }

  function catalogProviders(): any[] {
    return [
      { provide: ProductService, useValue: resourceStub() },
      { provide: MarketplaceService, useValue: resourceStub() },
      { provide: PriceListService, useValue: resourceStub() },
      { provide: DiscountService, useValue: resourceStub() },
      { provide: PriceHistoryService, useValue: resourceStub() },
      { provide: CurrencyService, useValue: resourceStub() },
      { provide: PermissionService, useValue: resourceStub() },
      { provide: UserService, useValue: resourceStub() },
      { provide: RoleService, useValue: resourceStub() },
      { provide: TenantService, useValue: resourceStub() },
      { provide: ApiKeyService, useValue: resourceStub() },
      {
        provide: PriceService,
        useValue: { ...resourceStub(), calculate: jasmine.createSpy('calculate').and.returnValue(of({ finalPrice: 90 })) }
      },
      { provide: ToastService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy(), dismiss: jasmine.createSpy(), clear: jasmine.createSpy(), toasts: () => [] } }
    ];
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders the products module', async () => {
    const fixture = await build(ProductsComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Productos');
  });

  it('renders the marketplaces module', async () => {
    const fixture = await build(MarketplacesComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Marketplaces');
  });

  it('renders the price lists module', async () => {
    const fixture = await build(PriceListsComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Listas de precios');
  });

  it('renders the prices module with the calculate preview button', async () => {
    const fixture = await build(PricesComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Precios');

    const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;
    page.openCreate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="preview-button"]')).toBeTruthy();
  });

  it('searches prices by SKU or name instead of by notes', fakeAsync(async () => {
    const fixture = await build(PricesComponent, catalogProviders());
    const priceService = TestBed.inject(PriceService) as any;
    const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;

    // The toolbar placeholder tells the user what the field actually searches.
    const search = fixture.nativeElement.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(search.placeholder).toBe('Buscar por SKU o nombre…');

    page.searchInput.setValue('CAFE-1000');
    tick(300);
    fixture.detectChanges();

    // The term travels as `search`; the backend resolves it against the product.
    expect(priceService.list).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'CAFE-1000', page: 1 }));
  }));

  it('renders the price history module as read-only', async () => {
    const fixture = await build(PriceHistoryComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Historial de precios');
    expect(fixture.nativeElement.querySelector('[data-testid="create-button"]')).toBeNull();

    const search = fixture.nativeElement.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(search.placeholder).toBe('Buscar por SKU o nombre…');
  });

  it('renders the discounts module', async () => {
    const fixture = await build(DiscountsComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Descuentos');
  });

  it('renders the API keys module with a revoke action', async () => {
    const fixture = await build(ApiKeysComponent, catalogProviders());
    const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;

    expect(fixture.nativeElement.textContent).toContain('API Keys');
    // Row action labels are catalog keys resolved while rendering.
    expect(page.visibleRowActions({ effectiveStatus: 'active' }).map((a: any) => a.label)).toEqual([
      { key: 'apiKeys.rowActions.revoke' }
    ]);
    expect(page.visibleRowActions({ effectiveStatus: 'revoked' })).toEqual([]);
  });

  it('renders the users module', async () => {
    const fixture = await build(UsersComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Usuarios');
  });

  it('renders the roles module with a permissions action', async () => {
    const fixture = await build(RolesComponent, catalogProviders());
    const session = TestBed.inject(SessionStore);
    session.setSession('token-1', {
      ...authUser(),
      permissions: ['roles:read', 'roles:assign-permissions']
    });

    const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;

    expect(fixture.nativeElement.textContent).toContain('Roles');
    expect(page.visibleRowActions({ id: 'r1' }).map((a: any) => a.label)).toEqual([
      { key: 'roles.rowActions.permissions' }
    ]);

    session.clear();
  });

  it('renders the companies module', async () => {
    const fixture = await build(CompaniesComponent, catalogProviders());
    expect(fixture.nativeElement.textContent).toContain('Empresas');
  });

  /**
   * Product cost: a nullable amount in the product currency.
   *
   * The UI must keep "not captured" distinct from a real zero cost, so a NULL
   * cost renders as a dash while 0 renders as a formatted amount. The form maps
   * an empty input to an explicit `null`, because the API rejects `''` and
   * cannot distinguish an omitted field from "leave the stored cost alone".
   */
  describe('products module cost', () => {
    function productCostProviders() {
      return catalogProviders().map((provider) =>
        provider.provide === ProductService
          ? {
              ...provider,
              useValue: {
                ...resourceStub(),
                list: jasmine.createSpy('list').and.returnValue(
                  of({
                    data: [
                      { id: 'p1', sku: 'SKU-1', name: 'Con costo', basePrice: 150, cost: 60, currencyCode: 'MXN', status: 'active' },
                      { id: 'p2', sku: 'SKU-2', name: 'Costo cero', basePrice: 150, cost: 0, currencyCode: 'MXN', status: 'active' },
                      { id: 'p3', sku: 'SKU-3', name: 'Sin costo', basePrice: 150, cost: null, currencyCode: 'MXN', status: 'active' }
                    ],
                    meta: { page: 1, limit: 10, total: 3, totalPages: 1 }
                  })
                )
              }
            }
          : provider
      );
    }

    it('renders the cost column with the product currency', async () => {
      const fixture = await build(ProductsComponent, productCostProviders());
      const formatting = TestBed.inject(LocaleFormattingService);
      const cells = Array.from(
        fixture.nativeElement.querySelectorAll('[data-row-id="p1"] td')
      ) as HTMLElement[];

      // Cost sits right after the base price.
      expect(cells[3].textContent).toContain(formatting.formatMoney(60, 'MXN'));
    });

    it('shows a dash for an unknown cost and a real amount for a zero cost', async () => {
      const fixture = await build(ProductsComponent, productCostProviders());
      const formatting = TestBed.inject(LocaleFormattingService);
      const cell = (rowId: string): string =>
        (Array.from(fixture.nativeElement.querySelectorAll(`[data-row-id="${rowId}"] td`)) as HTMLElement[])[3]
          .textContent!.trim();

      expect(cell('p3')).toBe('—');
      expect(cell('p2')).toBe(formatting.formatMoney(0, 'MXN'));
      // The distinction the whole contract rests on.
      expect(cell('p2')).not.toBe(cell('p3'));
    });

    it('offers an optional cost field and maps an empty input to null', async () => {
      const fixture = await build(ProductsComponent, productCostProviders());
      const component = fixture.componentInstance as ProductsComponent;
      const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;

      page.openCreate();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('[id="field-cost"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.type).toBe('number');

      const mapper = component.mapToPayload;
      expect(mapper({ cost: '' }, { isEditing: false })['cost']).toBeNull();
      expect(mapper({ cost: 90 }, { isEditing: false })['cost']).toBe(90);
      expect(mapper({ cost: '95.5' }, { isEditing: true })['cost']).toBe(95.5);
      expect(mapper({ cost: 0 }, { isEditing: false })['cost']).toBe(0);
      // No numeric coercion path may ever turn "unknown" into a zero cost.
      expect(mapper({ cost: '' }, { isEditing: true })['cost']).not.toBe(0);
    });

    it('keeps the other fields untouched when normalizing the cost', async () => {
      const fixture = await build(ProductsComponent, productCostProviders());
      const component = fixture.componentInstance as ProductsComponent;
      const mapper = component.mapToPayload;

      const payload = mapper(
        { sku: 'SKU-1', name: 'Producto', basePrice: 150, currencyCode: 'MXN', status: 'active', description: '', cost: '' },
        { isEditing: false }
      );

      expect(payload).toEqual({
        sku: 'SKU-1',
        name: 'Producto',
        basePrice: 150,
        currencyCode: 'MXN',
        status: 'active',
        description: '',
        cost: null
      });
    });
  });

  it('renders the settings module with the read-only currency table', async () => {    await TestBed.configureTestingModule({
      imports: [SettingsComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        iconProviders,
        {
          provide: CurrencyService,
          useValue: {
            ...resourceStub(),
            list: jasmine.createSpy('list').and.returnValue(
              of({
                data: [{ code: 'MXN', name: 'Peso mexicano', symbol: '$', decimals: 2, status: 'active' }],
                meta: { page: 1, limit: 100, total: 1, totalPages: 1 }
              })
            )
          }
        },
        {
          provide: TenantService,
          useValue: {
            ...resourceStub(),
            me: jasmine.createSpy('me').and.returnValue(of({ timeZone: 'UTC' })),
            updateTimeZone: jasmine.createSpy('updateTimeZone').and.returnValue(of({ timeZone: 'UTC' }))
          }
        },
        {
          provide: ToastService,
          useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy(), dismiss: jasmine.createSpy(), clear: jasmine.createSpy(), toasts: () => [] }
        }
      ]
    }).compileComponents();
    installTestTranslations();

    // The page only loads its company-scoped panels once the session is known:
    // on a hard load the guard restores it, and the page must not fire
    // authenticated requests before that.
    TestBed.inject(SessionStore).setSession(
      'access-token',
      authUser({ permissions: ['settings:read', 'currencies:read'] })
    );

    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="currencies-table"]').textContent).toContain('MXN');
    expect(fixture.nativeElement.textContent).toContain('sólo lectura');
  });

  /**
   * Representative coverage for the runtime switch, as required by the plan:
   * every screen renders from the catalogs, so flipping the language must change
   * both the rendered chrome and the declarative configuration labels, with no
   * raw key left behind.
   */
  describe('runtime language switch', () => {
    afterEach(() => TestBed.resetTestingModule());

    /** Flips the locale, re-renders and asserts no raw key leaked. */
    async function switchTo(locale: 'es-419' | 'en-US', fixture: ComponentFixture<any>): Promise<string> {
      TestBed.inject(LanguageService).setLocale(locale);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      // A missing catalog entry would render as `namespace.someKey`.
      expect(text).not.toMatch(
        /\b(common|crud|state|status|shell|users|roles|products|prices|settings|dashboard)\.[a-zA-Z]+\b/
      );
      return text;
    }

    /** Resolves a declarative `DisplayText` the way the templates do. */
    function resolve(value: unknown): string {
      return TestBed.inject(DisplayTextService).resolve(value as never);
    }

    it('switches the products module between locales', async () => {
      const fixture = await build(ProductsComponent, catalogProviders());
      const component = fixture.componentInstance as ProductsComponent;

      expect(await switchTo('es-419', fixture)).toContain('Productos');
      const english = await switchTo('en-US', fixture);
      expect(english).toContain('Products');
      expect(english).toContain('Refresh');

      // Column and field labels are catalog keys resolved at render time.
      expect(resolve(component.columns[2].label)).toBe('Base price');
      expect(resolve(component.columns[3].label)).toBe('Cost');
      expect(resolve(component.fields[5].label)).toBe('Status');

      await switchTo('es-419', fixture);
      expect(resolve(component.columns[2].label)).toBe('Precio base');
      expect(resolve(component.columns[3].label)).toBe('Costo');
      expect(resolve(component.fields[5].label)).toBe('Estado');
    });

    it('switches the price search placeholders between locales', async () => {
      const fixture = await build(PricesComponent, catalogProviders());
      const component = fixture.componentInstance as PricesComponent;
      const productField = component.fields.find((field) => field.key === 'productId')!;

      /** The toolbar placeholder as the user actually sees it. */
      function toolbarPlaceholder(): string {
        fixture.detectChanges();
        return (fixture.nativeElement.querySelector('[data-testid="search-input"]') as HTMLInputElement)
          .placeholder;
      }

      await switchTo('es-419', fixture);
      expect(toolbarPlaceholder()).toBe('Buscar por SKU o nombre…');
      expect(resolve(productField.placeholder!)).toBe('Buscar producto por SKU o nombre…');

      await switchTo('en-US', fixture);
      expect(toolbarPlaceholder()).toBe('Search by SKU or name…');
      expect(resolve(productField.placeholder!)).toBe('Search product by SKU or name…');
    });

    it('switches the users module, including the preferred-language field', async () => {
      const fixture = await build(UsersComponent, catalogProviders());
      const component = fixture.componentInstance as UsersComponent;

      const localeField = component.fields.find((field) => field.key === 'preferredLocale')!;
      expect(localeField).withContext('the Users screen must expose the language field').toBeDefined();

      await switchTo('es-419', fixture);
      expect(resolve(localeField.label)).toBe('Idioma preferido');

      await switchTo('en-US', fixture);
      expect(resolve(localeField.label)).toBe('Preferred language');
    });

    it('switches the roles module', async () => {
      const fixture = await build(RolesComponent, catalogProviders());

      expect(await switchTo('es-419', fixture)).toContain('Roles');
      const english = await switchTo('en-US', fixture);
      expect(english).toContain('Roles');
      expect(english).toContain('System roles and the company');
    });

    it('switches the discount enums by code', async () => {
      const fixture = await build(DiscountsComponent, catalogProviders());
      const component = fixture.componentInstance as DiscountsComponent;

      const typeColumn = component.columns.find((column) => column.key === 'type')!;

      await switchTo('es-419', fixture);
      expect(resolve(typeColumn.value!({ type: 'percentage' }))).toBe('Porcentaje');
      expect(resolve(component.columns[3].value!({ appliesTo: 'price_list' }))).toBe('Lista de precios');

      await switchTo('en-US', fixture);
      expect(resolve(typeColumn.value!({ type: 'percentage' }))).toBe('Percentage');
      expect(resolve(component.columns[3].value!({ appliesTo: 'price_list' }))).toBe('Price list');

      // An unknown code stays visible instead of blanking the cell.
      expect(resolve(typeColumn.value!({ type: 'brand_new' }))).toBe('brand_new');
    });

    it('translates the seeded system role name by slug', async () => {
      const fixture = await build(RolesComponent, catalogProviders());
      const page = fixture.debugElement.query(By.css('app-crud-page')).componentInstance;

      const systemRole = { id: 'r1', slug: 'global_admin', name: 'Global administrator', isSystem: true };

      expect(page.cellText(systemRole, page.columns()[0])).toBe('Administrador global');

      TestBed.inject(LanguageService).setLocale('en-US');
      expect(page.cellText(systemRole, page.columns()[0])).toBe('Global administrator');

      // A custom role keeps its database copy in both languages.
      const customRole = { id: 'r2', slug: 'analista', name: 'Analista de precios', isSystem: false };
      expect(page.cellText(customRole, page.columns()[0])).toBe('Analista de precios');
    });

    it('switches the login screen', async () => {
      const authService = { login: jasmine.createSpy('login') };
      await TestBed.configureTestingModule({
        imports: [LoginComponent, provideTranslocoTesting()],
        providers: [provideRouter([]), iconProviders, { provide: AuthService, useValue: authService }]
      }).compileComponents();
      installTestTranslations();

      const fixture = TestBed.createComponent(LoginComponent);
      fixture.detectChanges();

      expect(await switchTo('es-419', fixture)).toContain('Ingresar');
      expect(await switchTo('en-US', fixture)).toContain('Sign in');
    });
  });
});
