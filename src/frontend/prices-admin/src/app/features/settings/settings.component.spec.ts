import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { APP_ICONS } from '../../core/icons';
import { SettingsComponent } from './settings.component';
import { CurrencyService } from '../../core/services/catalog.services';
import { TenantService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';

/**
 * The Settings page carries the two catalog entries.
 *
 * The interesting cases are the permission gate of the Suppliers section, the
 * global-only visibility of the Units of measure section, and the state where a
 * global administrator has no company selected — the page must render the global
 * section without firing a single tenant-scoped request.
 */
describe('SettingsComponent catalog sections', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let currencies: { list: jasmine.Spy };
  let tenants: { me: jasmine.Spy; updateTimeZone: jasmine.Spy };

  interface SessionOptions {
    permissions: string[];
    globalAdmin?: boolean;
    activeTenantId?: string | null;
  }

  async function setup(options: SessionOptions, currencyRows: unknown[] = []) {
    window.localStorage.clear();

    currencies = {
      list: jasmine.createSpy('list').and.returnValue(
        of({ data: currencyRows, meta: { page: 1, limit: 100, total: currencyRows.length, totalPages: 1 } })
      )
    };
    tenants = {
      me: jasmine.createSpy('me').and.returnValue(
        of({ id: 'tenant-1', commercialName: 'Demo', timeZone: 'America/Mexico_City' })
      ),
      updateTimeZone: jasmine.createSpy('updateTimeZone').and.returnValue(of({ timeZone: 'UTC' }))
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        // Icons are registered at bootstrap in the application; a TestBed has to
        // pick the same set or the section headings fail to render.
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: CurrencyService, useValue: currencies },
        { provide: TenantService, useValue: tenants },
        {
          provide: SessionStore,
          useValue: {
            hasPermission: (permission: string) => options.permissions.includes(permission),
            isGlobalAdmin: () => options.globalAdmin === true,
            activeTenantId: () => options.activeTenantId ?? null,
            user: () => ({
              name: 'Admin',
              roleSlug: 'tenant_admin',
              isGlobalAdmin: options.globalAdmin === true,
              permissions: options.permissions
            }),
            permissions: () => options.permissions
          }
        }
      ]
    }).compileComponents();

    installTestTranslations();
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  const query = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;

  it('shows the global catalog sections to a global administrator', async () => {
    await setup({ permissions: [], globalAdmin: true, activeTenantId: 'tenant-1' });

    const suppliers = query('[data-testid="settings-suppliers"]')!;
    // Each section is a navigation entry: exactly one button, no catalog table.
    expect(suppliers).toBeTruthy();
    expect(suppliers.querySelectorAll('button').length).toBe(1);
    expect(suppliers.querySelector('table')).toBeNull();
    expect(query('[data-testid="settings-units"]')).toBeTruthy();
  });

  it('hides both catalog sections from a company user', async () => {
    await setup({ permissions: ['settings:read', 'suppliers:read'], activeTenantId: 'tenant-1' });

    // Both catalogs are global, so a company user manages neither from here; the
    // supplier picker still lets them assign suppliers.
    expect(query('[data-testid="settings-suppliers"]')).toBeNull();
    expect(query('[data-testid="settings-units"]')).toBeNull();
  });

  it('navigates to the supplier catalog from its button', async () => {
    await setup({ permissions: [], globalAdmin: true, activeTenantId: null });
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    query('[data-testid="manage-suppliers"]')!.click();

    expect(navigate).toHaveBeenCalledWith(['/suppliers']);
  });

  it('lets a global administrator open both catalogs with no company', async () => {
    await setup({ permissions: [], globalAdmin: true, activeTenantId: null });

    // Both global sections are reachable, and the company-bound panels are gone
    // because nothing tenant-scoped was requested.
    expect(query('[data-testid="settings-units"]')).toBeTruthy();
    expect(query('[data-testid="settings-suppliers"]')).toBeTruthy();
    expect(query('[data-testid="currencies-table"]')).toBeNull();
    expect(currencies.list).not.toHaveBeenCalled();
    expect(tenants.me).not.toHaveBeenCalled();

    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    query('[data-testid="manage-units-of-measure"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/units-of-measure']);
  });

  it('lists the two catalog sections after Currencies', async () => {
    await setup({
      permissions: ['settings:read'],
      globalAdmin: true,
      activeTenantId: 'tenant-1'
    });

    const html: string = fixture.nativeElement.innerHTML;
    const currenciesIndex = html.indexOf('currencies-table');
    const suppliersIndex = html.indexOf('settings-suppliers');
    const unitsIndex = html.indexOf('settings-units');

    expect(suppliersIndex).toBeGreaterThan(currenciesIndex);
    expect(unitsIndex).toBeGreaterThan(suppliersIndex);
  });

  it('keeps the tenant panels for a company user', async () => {
    await setup({ permissions: ['settings:read', 'currencies:read'], activeTenantId: 'tenant-1' }, [
      { id: 'c1', code: 'MXN', name: 'Peso mexicano', symbol: '$', decimals: 2, status: 'active' }
    ]);

    expect(currencies.list).toHaveBeenCalled();
    expect(tenants.me).toHaveBeenCalled();
    expect(query('[data-testid="currencies-table"]')).toBeTruthy();
  });
});
