import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from '../services/session.store';
import { LanguageService } from '../i18n/language.service';

/**
 * Attaches the in-memory access token, the canonical `Accept-Language`, and for
 * a global administrator the `X-Tenant-Id` header selecting the active company.
 * `withCredentials` lets the HttpOnly refresh cookie travel with the request.
 *
 * `Accept-Language` is sent for logs and for future backend notifications/jobs;
 * this phase does not translate server responses.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const language = inject(LanguageService);

  const headers: Record<string, string> = {
    'Accept-Language': language.activeLocale()
  };

  const token = session.accessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const tenantId = session.activeTenantId();
  if (session.isGlobalAdmin() && tenantId) headers['X-Tenant-Id'] = tenantId;

  return next(req.clone({ setHeaders: headers, withCredentials: true }));
};
