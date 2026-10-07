import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionStore } from '../services/session.store';
import type { LoginResponse } from '../models';

/**
 * Protects the dashboard routes. The access token lives in memory only, so on
 * a hard reload the guard silently restores the session from the refresh
 * cookie before redirecting to the login page.
 */
export const authGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const http = inject(HttpClient);
  const router = inject(Router);

  if (session.isAuthenticated()) return true;

  return http
    .post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true })
    .pipe(
      tap((response) => session.setSession(response.accessToken, response.user)),
      map(() => true),
      catchError(() => of(router.createUrlTree(['/login'])))
    );
};

/** Keeps an authenticated user away from the login screen. */
export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return session.isAuthenticated()
    ? router.createUrlTree(session.hasPermission('price-catalog:read') ? ['/price-catalog'] : ['/dashboard'])
    : true;
};
