import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subject, of, throwError } from 'rxjs';
import { ShellComponent } from './shell.component';
import { APP_ICONS } from '../core/icons';
import { AuthService } from '../core/services/auth.service';
import { TenantService } from '../core/services/access.services';
import { SessionStore } from '../core/services/session.store';
import { UserPreferencesService } from '../core/services/user-preferences.service';
import { ToastService } from '../core/services/toast.service';
import { LanguageService } from '../core/i18n/language.service';
import { installTestTranslations, provideTranslocoTesting } from '../testing';
import type { AuthUser } from '../core/models';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'viewer@example.com',
    name: 'Price Viewer',
    roleId: 'role-1',
    roleSlug: 'price_catalog_viewer',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['price-catalog:read'],
    preferredLocale: 'es-419',
    ...overrides
  };
}

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let session: SessionStore;
  let language: LanguageService;
  let preferences: { updateLocale: jasmine.Spy };
  let logout: jasmine.Spy;

  async function build(user: AuthUser = authUser()): Promise<void> {
    // The locale facade persists to localStorage; specs must not leak into each other.
    window.localStorage.clear();
    preferences = { updateLocale: jasmine.createSpy('updateLocale') };
    logout = jasmine.createSpy('logout').and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [ShellComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: AuthService, useValue: { logout } },
        { provide: TenantService, useValue: { list: jasmine.createSpy('list').and.returnValue(of({ data: [] })) } },
        { provide: UserPreferencesService, useValue: preferences }
      ]
    }).compileComponents();

    installTestTranslations();
    language = TestBed.inject(LanguageService);
    session = TestBed.inject(SessionStore);
    session.clear();
    session.setSession('token', user);

    fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function selectorTrigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="language-selector-trigger"]');
  }

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the registered search and catalog navigation icons', async () => {
    await build();

    expect(fixture.nativeElement.querySelector('svg.lucide-search')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('svg.lucide-scan-search')).toBeTruthy();
  });

  it('places the language selector in the header, outside the profile menu', async () => {
    await build();

    const header = fixture.nativeElement.querySelector('header');
    const selector = fixture.nativeElement.querySelector('[data-testid="language-selector"]');
    const profileButton = fixture.nativeElement.querySelector('[data-testid="user-menu-button"]');

    expect(selector).toBeTruthy();
    expect(header.contains(selector)).toBe(true);
    expect(header.contains(profileButton)).toBe(true);

    // The mobile menu / profile button contains no language options.
    expect(profileButton.querySelector('[data-testid="language-selector"]')).toBeNull();

    // It sits immediately before the profile control.
    const controls = Array.from(
      header.querySelectorAll(
        '[data-testid="language-selector"], [data-testid="user-menu-button"]'
      ) as NodeListOf<HTMLElement>
    );
    expect(controls.map((node) => node.getAttribute('data-testid'))).toEqual([
      'language-selector',
      'user-menu-button'
    ]);
  });

  it('shows the language selector for a user with no company selected', async () => {
    await build(authUser({ isGlobalAdmin: true, tenantId: null, permissions: [] }));

    expect(selectorTrigger()).toBeTruthy();
  });

  it('shows the language selector for every role, without extra permissions', async () => {
    await build(authUser({ permissions: [], roleSlug: 'readonly_user' }));

    expect(selectorTrigger()).toBeTruthy();
  });

  it('reflects the locale of the authenticated user', async () => {
    await build(authUser({ preferredLocale: 'en-US' }));

    expect(language.activeLocale()).toBe('en-US');
    expect(selectorTrigger().textContent).toContain('English');
  });

  it('persists a language change and updates the session user', async () => {
    await build(authUser({ preferredLocale: 'es-419' }));
    preferences.updateLocale.and.returnValue(of(authUser({ preferredLocale: 'en-US' })));
    const toast = TestBed.inject(ToastService);

    fixture.componentInstance.changeLanguage('en-US');
    fixture.detectChanges();

    // Applied optimistically, before the API answers.
    expect(language.activeLocale()).toBe('en-US');
    expect(preferences.updateLocale).toHaveBeenCalledWith('en-US');

    expect(session.user()?.preferredLocale).toBe('en-US');
    expect(toast.toasts().length).toBe(0);
  });

  it('rolls back and shows a localized toast when persistence fails', async () => {
    await build(authUser({ preferredLocale: 'es-419' }));
    preferences.updateLocale.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', error: null }))
    );
    const toast = TestBed.inject(ToastService);

    fixture.componentInstance.changeLanguage('en-US');
    fixture.detectChanges();

    // Restored to the previous language...
    expect(language.activeLocale()).toBe('es-419');
    // ...and the user is told, in the restored language.
    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].kind).toBe('error');
    expect(toast.toasts()[0].message).toContain('No se pudo guardar el idioma');
    expect(toast.toasts()[0].message).toContain('Español (Latinoamérica)');
    expect(session.user()?.preferredLocale).toBe('es-419');
  });

  it('reports a known API code instead of the generic save failure', async () => {
    await build(authUser({ preferredLocale: 'es-419' }));
    preferences.updateLocale.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { statusCode: 422, code: 'TENANT_REQUIRED', message: 'raw english prose' }
          })
      )
    );
    const toast = TestBed.inject(ToastService);

    fixture.componentInstance.changeLanguage('en-US');
    fixture.detectChanges();

    // The localized code wins over both the fallback and the API prose.
    expect(toast.toasts()[0].message).toBe('Selecciona una empresa para continuar.');
  });

  it('ignores a repeated selection while a save is in flight', async () => {
    await build(authUser({ preferredLocale: 'es-419' }));
    const pending = new Subject<AuthUser>();
    preferences.updateLocale.and.returnValue(pending.asObservable());

    fixture.componentInstance.changeLanguage('en-US');
    // The first save is still in flight, so the second call must be ignored.
    fixture.componentInstance.changeLanguage('es-419');

    expect(preferences.updateLocale).toHaveBeenCalledTimes(1);
    expect(preferences.updateLocale).toHaveBeenCalledWith('en-US');

    pending.next(authUser({ preferredLocale: 'en-US' }));
    pending.complete();

    expect(session.user()?.preferredLocale).toBe('en-US');
  });

  it('never changes the language when a global admin switches company', async () => {
    await build(authUser({ isGlobalAdmin: true, tenantId: null, preferredLocale: 'en-US', permissions: [] }));

    fixture.componentInstance.onTenantChange('tenant-42');
    fixture.detectChanges();

    expect(language.activeLocale()).toBe('en-US');
    expect(session.activeTenantId()).toBe('tenant-42');
  });

  it('collapses the language label before the company selector when the header is tight', async () => {
    await build(authUser({ isGlobalAdmin: true, tenantId: null, permissions: [] }));

    const label = selectorTrigger().querySelector('span');
    // A global administrator also renders the company selector, so the language
    // label waits until `lg`.
    expect(label?.className).toContain('lg:inline');
    // The globe itself is never hidden.
    expect(selectorTrigger().querySelector('svg.lucide-globe-2')).toBeTruthy();
  });

  it('keeps the label visible from md up for a regular user', async () => {
    await build();

    expect(selectorTrigger().querySelector('span')?.className).toContain('md:inline');
  });

  it('localizes the navigation labels and follows a runtime switch', async () => {
    await build(
      authUser({ preferredLocale: 'es-419', permissions: ['price-catalog:read', 'users:read'] })
    );

    const navText = () => fixture.nativeElement.querySelector('[data-testid="sidebar-nav"]').textContent as string;

    expect(navText()).toContain('Catálogo de precios');
    expect(navText()).toContain('Usuarios');

    // No untranslated keys leak into the sidebar.
    expect(navText()).not.toContain('shell.nav.');

    language.setLocale('en-US');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navText()).toContain('Price catalog');
    expect(navText()).toContain('Users');
  });
});
