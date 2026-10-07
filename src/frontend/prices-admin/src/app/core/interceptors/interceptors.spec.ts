import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { jwtInterceptor } from './jwt.interceptor';
import { errorInterceptor, resetRefreshState } from './error.interceptor';
import { SessionStore } from '../services/session.store';
import { LanguageService } from '../i18n/language.service';
import type { AuthUser } from '../models';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
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

describe('jwtInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  afterEach(() => httpMock.verify());

  it('sends credentials so the refresh cookie travels', () => {
    http.get('/api/test').subscribe();

    const request = httpMock.expectOne('/api/test');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('sends a canonical Accept-Language for the active locale', () => {
    const language = TestBed.inject(LanguageService);

    http.get('/api/test').subscribe();

    const request = httpMock.expectOne('/api/test');
    const acceptLanguage = request.request.headers.get('Accept-Language');
    // Canonical means one of the two supported codes, never a loose browser tag
    // such as `es-MX` or `en-GB`. Asserted against the service so the test does
    // not depend on the locale of the host running the suite.
    expect(acceptLanguage).toBe(language.activeLocale());
    expect(['es-419', 'en-US']).toContain(acceptLanguage ?? '');
    request.flush({});
  });

  it('sends the language of the active session, not the browser default', () => {
    session.setSession('token-1', authUser({ preferredLocale: 'en-US' }));

    http.get('/api/test').subscribe();

    const request = httpMock.expectOne('/api/test');
    expect(request.request.headers.get('Accept-Language')).toBe('en-US');
    // The other headers are preserved alongside it.
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush({});
  });

  it('follows a runtime language switch', () => {
    session.setSession('token-1', authUser({ preferredLocale: 'es-419' }));

    http.get('/api/test').subscribe();
    expect(httpMock.expectOne('/api/test').request.headers.get('Accept-Language')).toBe('es-419');

    TestBed.inject(LanguageService).setLocale('en-US');

    http.get('/api/test').subscribe();
    const second = httpMock.expectOne('/api/test');
    expect(second.request.headers.get('Accept-Language')).toBe('en-US');
    second.flush({});
  });

  it('attaches the bearer token', () => {
    session.setSession('token-1', authUser());
    http.get('/api/test').subscribe();

    const request = httpMock.expectOne('/api/test');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush({});
  });

  it('adds X-Tenant-Id only for a global administrator', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    session.selectTenant('tenant-42');

    http.get('/api/test').subscribe();
    const request = httpMock.expectOne('/api/test');
    expect(request.request.headers.get('X-Tenant-Id')).toBe('tenant-42');
    request.flush({});

    session.setSession('token-2', authUser());
    http.get('/api/test').subscribe();
    const regular = httpMock.expectOne('/api/test');
    expect(regular.request.headers.has('X-Tenant-Id')).toBe(false);
    regular.flush({});
  });
});

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionStore;

  beforeEach(() => {
  window.localStorage.clear();
    resetRefreshState();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  afterEach(() => httpMock.verify());

  it('refreshes once and replays the request on 401', () => {
    session.setSession('expired', authUser());
    let payload: unknown;

    http.get('/api/data').subscribe((response) => (payload = response));

    httpMock.expectOne('/api/data').flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: 'fresh-token', user: authUser() });

    const retried = httpMock.expectOne('/api/data');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retried.flush({ ok: true });

    expect(payload).toEqual({ ok: true });
    expect(session.accessToken()).toBe('fresh-token');
  });

  it('logs out and redirects when the refresh fails', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    session.setSession('expired', authUser());
    let failed = false;

    http.get('/api/data').subscribe({ error: () => (failed = true) });

    httpMock.expectOne('/api/data').flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(session.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('shares a single refresh between concurrent 401s', () => {
    session.setSession('expired', authUser());

    http.get('/api/one').subscribe();
    http.get('/api/two').subscribe();

    httpMock.expectOne('/api/one').flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/two').flush({}, { status: 401, statusText: 'Unauthorized' });

    // Exactly one refresh for both failures.
    httpMock
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: 'shared-token', user: authUser() });

    httpMock.expectOne('/api/one').flush({ ok: 1 });
    httpMock.expectOne('/api/two').flush({ ok: 2 });
  });

  it('does not intercept failures from the auth endpoints', () => {
    let failed = false;
    http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => (failed = true) });

    httpMock
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ message: 'bad credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    httpMock.expectNone(`${environment.apiUrl}/auth/refresh`);
  });

  it('passes non-401 errors through', () => {
    let status = 0;
    http.get('/api/data').subscribe({ error: (error) => (status = error.status) });

    httpMock.expectOne('/api/data').flush({}, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
    httpMock.expectNone(`${environment.apiUrl}/auth/refresh`);
  });
});
