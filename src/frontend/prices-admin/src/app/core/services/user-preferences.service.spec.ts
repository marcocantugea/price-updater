import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserPreferencesService } from './user-preferences.service';
import { environment } from '../../../environments/environment';
import type { AuthUser } from '../models';

const ENDPOINT = `${environment.apiUrl}/auth/me/preferences`;

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

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(UserPreferencesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('PATCHes the canonical locale to the self-service endpoint', () => {
    let received: AuthUser | undefined;
    service.updateLocale('en-US').subscribe((user) => (received = user));

    const request = http.expectOne(ENDPOINT);
    expect(request.request.method).toBe('PATCH');
    // The body carries only the locale: the target user comes from the token.
    expect(request.request.body).toEqual({ preferredLocale: 'en-US' });

    request.flush(authUser({ preferredLocale: 'en-US' }));

    expect(received?.preferredLocale).toBe('en-US');
  });

  it('leaves credentials and headers to the HTTP interceptors', () => {
    service.updateLocale('es-419').subscribe();

    const request = http.expectOne(ENDPOINT);
    // The service must not fight the interceptor chain: jwtInterceptor is the
    // single place that adds withCredentials and Accept-Language.
    expect(request.request.headers.keys()).toEqual([]);
    expect(request.request.withCredentials).toBe(false);
    request.flush(authUser());
  });

  it('propagates a 422 validation failure', () => {
    let status: number | undefined;
    service.updateLocale('en-US').subscribe({ error: (error) => (status = error.status) });

    http
      .expectOne(ENDPOINT)
      .flush({ statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid input' }, { status: 422, statusText: 'Unprocessable' });

    expect(status).toBe(422);
  });

  it('propagates a network failure', () => {
    let received: unknown;
    service.updateLocale('en-US').subscribe({ error: (error) => (received = error) });

    http.expectOne(ENDPOINT).error(new ProgressEvent('error'));

    expect(received).toBeTruthy();
  });
});
