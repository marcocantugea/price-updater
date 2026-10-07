import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { CanActivateFn, Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authGuard, guestGuard } from './auth.guard';
import { globalAdminGuard, permissionGuard } from './permission.guard';
import { tenantGuard } from './tenant.guard';
import { SessionStore } from '../services/session.store';
import { LanguageService, UI_LOCALE_STORAGE_KEY } from '../i18n/language.service';
import { createAuthUser, installTestTranslations, provideTranslocoTesting } from '../../testing';
import type { AuthUser } from '../models';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return createAuthUser(overrides);
}

async function runGuard(guard: CanActivateFn): Promise<boolean | UrlTree> {
  const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));
  if (result instanceof Observable || result instanceof Promise) {
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }
  return result as boolean | UrlTree;
}

describe('authGuard', () => {
  let http: HttpTestingController;
  let session: SessionStore;

  /** An unsupported browser preference, so only a cache or the API can win. */
  function stubBrowserLocale(tag: string): void {
    Object.defineProperty(window.navigator, 'languages', { value: [tag], configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: tag, configurable: true });
  }

  function restoreBrowserLocale(): void {
    delete (window.navigator as unknown as Record<string, unknown>)['languages'];
    delete (window.navigator as unknown as Record<string, unknown>)['language'];
  }

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    installTestTranslations();
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  afterEach(() => {
    restoreBrowserLocale();
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('allows an authenticated user', async () => {
    session.setSession('token-1', authUser());
    expect(await runGuard(authGuard)).toBe(true);
    http.verify();
  });

  it('silently restores the session from the refresh cookie', async () => {
    const result = runGuard(authGuard);

    http.expectOne(`${environment.apiUrl}/auth/refresh`).flush({ accessToken: 'token-2', user: authUser() });

    expect(await result).toBe(true);
    expect(session.isAuthenticated()).toBe(true);
  });

  it('applies the restored user locale before the protected screen renders', async () => {
    // The guest starts in English; the API says es-419, and the server
    // preference must win by the time the guard resolves.
    //
    // `session.clear()` in beforeEach already cached the locale it resolved, and
    // the cache beats the browser, so the cache is cleared after stubbing the
    // browser preference to make the guest resolution deterministic.
    window.localStorage.clear();
    stubBrowserLocale('en-US');
    const language = TestBed.inject(LanguageService);
    language.resetToGuestLocale();
    expect(language.activeLocale()).toBe('en-US');

    const result = runGuard(authGuard);
    http
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: 'token-2', user: authUser({ preferredLocale: 'es-419' }) });

    expect(await result).toBe(true);
    expect(language.activeLocale()).toBe('es-419');
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('es-419');
  });

  it('leaves the guest locale in place when the refresh fails', async () => {
    // A cached locale is what the login page must keep showing after a failed
    // silent restore.
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'en-US');
    const language = TestBed.inject(LanguageService);
    language.resetToGuestLocale();
    expect(language.activeLocale()).toBe('en-US');

    const result = runGuard(authGuard);
    http
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    const outcome = await result;
    expect(outcome).toBeInstanceOf(UrlTree);
    expect(String(outcome)).toContain('/login');

    expect(language.activeLocale()).toBe('en-US');
    expect(session.isAuthenticated()).toBe(false);
  });

  it('redirects to the login page when the refresh fails', async () => {
    const result = runGuard(authGuard);

    http
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    const outcome = await result;
    expect(outcome).toBeInstanceOf(UrlTree);
    expect(String(outcome)).toContain('/login');
  });
});

describe('guestGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()], providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('lets anonymous users reach the login page', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any)) as boolean | UrlTree;
    expect(result).toBe(true);
  });

  it('sends authenticated users to the dashboard', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });
});

describe('permissionGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()], providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a user holding the permission', () => {
    session.setSession('token-1', authUser({ permissions: ['products:read'] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:read')({} as any, {} as any)
    ) as boolean | UrlTree;

    expect(result).toBe(true);
  });

  it('redirects a user without the permission', () => {
    session.setSession('token-1', authUser({ permissions: [] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:delete')({} as any, {} as any)
    ) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });

  it('always allows the global admin', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, permissions: [] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:delete')({} as any, {} as any)
    ) as boolean;

    expect(result).toBe(true);
  });
});

describe('globalAdminGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()], providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a global admin', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    const result = TestBed.runInInjectionContext(() => globalAdminGuard({} as any, {} as any)) as boolean;

    expect(result).toBe(true);
  });

  it('redirects a regular user', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => globalAdminGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
  });
});

describe('tenantGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()], providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a non-global user (tenant comes from the JWT)', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as boolean;

    expect(result).toBe(true);
  });

  it('requires a global admin to pick a company', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/companies');
  });

  it('allows a global admin with a selected company', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    session.selectTenant('tenant-42');

    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as boolean;
    expect(result).toBe(true);
  });
});
