import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionStore } from '../services/session.store';
import type { LoginResponse } from '../models';

/** In-flight refresh shared by every concurrent 401 (single-flight). */
let refreshRequest$: Observable<LoginResponse> | null = null;

/** Test helper: clears the shared refresh observable. */
export function resetRefreshState(): void {
  refreshRequest$ = null;
}

function refreshOnce(http: HttpClient, session: SessionStore): Observable<LoginResponse> {
  if (!refreshRequest$) {
    refreshRequest$ = http
      .post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response) => session.setSession(response.accessToken, response.user)),
        finalize(() => {
          refreshRequest$ = null;
        }),
        shareReplay(1)
      );
  }
  return refreshRequest$;
}

/**
 * On a 401 it refreshes the session once and replays the request; if the
 * refresh fails the session is cleared and the user is sent to the login page.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const http = inject(HttpClient);
  const router = inject(Router);

  const isAuthCall = req.url.includes('/auth/');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }

      return refreshOnce(http, session).pipe(
        switchMap(() => {
          const headers: Record<string, string> = {};
          const token = session.accessToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const tenantId = session.activeTenantId();
          if (session.isGlobalAdmin() && tenantId) headers['X-Tenant-Id'] = tenantId;
          return next(req.clone({ setHeaders: headers, withCredentials: true }));
        }),
        catchError(() => {
          session.clear();
          void router.navigate(['/login']);
          return throwError(() => error);
        })
      );
    })
  );
};
