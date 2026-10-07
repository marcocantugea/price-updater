import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionStore } from './session.store';
import type { AuthUser, LoginResponse } from '../models';

/**
 * Authentication endpoints. The refresh token travels in an HttpOnly cookie,
 * so every call is made with credentials.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  private get baseUrl(): string {
    return `${environment.apiUrl}/auth`;
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { email, password })
      .pipe(tap((response) => this.session.setSession(response.accessToken, response.user)));
  }

  refresh(): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/refresh`, {})
      .pipe(tap((response) => this.session.setSession(response.accessToken, response.user)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}).pipe(
      tap({
        next: () => this.session.clear(),
        error: () => this.session.clear()
      })
    );
  }

  me(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.baseUrl}/me`)
      .pipe(tap((user) => this.session.patchUser(user)));
  }
}
