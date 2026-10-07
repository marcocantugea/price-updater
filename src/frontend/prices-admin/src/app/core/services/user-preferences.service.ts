import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AuthUser } from '../models';
import type { SupportedLocale } from '../i18n/supported-locales';

/**
 * Self-service locale persistence.
 *
 * `PATCH /auth/me/preferences` is authenticated but deliberately needs neither
 * a tenant context nor a RBAC permission, so a global administrator without a
 * selected company can use it. The target user always comes from the access
 * token; the body carries only the canonical locale.
 */
@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly http = inject(HttpClient);

  private get baseUrl(): string {
    return `${environment.apiUrl}/auth/me/preferences`;
  }

  /** Persists the locale and returns the updated `AuthUser`. */
  updateLocale(preferredLocale: SupportedLocale): Observable<AuthUser> {
    return this.http.patch<AuthUser>(this.baseUrl, { preferredLocale });
  }
}
