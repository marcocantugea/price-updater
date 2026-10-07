import { Injectable, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
import type { AuthUser } from '../models';

/**
 * Holds the session **in memory**: the access token is never persisted and the
 * refresh token lives in an HttpOnly cookie owned by the API.
 *
 * It is also the single place where an authenticated locale preference is
 * applied. Every session creation/restoration path (login, explicit refresh,
 * interceptor refresh, guard refresh) goes through `setSession`, so the
 * server-side preference always wins without each caller remembering to do it.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly language = inject(LanguageService);

  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly tenantSignal = signal<string | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly activeTenantId = this.tenantSignal.asReadonly();

  readonly isAuthenticated = computed(() => this.accessTokenSignal() !== null);
  readonly isGlobalAdmin = computed(() => this.userSignal()?.isGlobalAdmin === true);
  readonly permissions = computed(() => this.userSignal()?.permissions ?? []);
  readonly tenantId = computed(() => this.userSignal()?.tenantId ?? null);

  setSession(accessToken: string, user: AuthUser): void {
    this.accessTokenSignal.set(accessToken);
    this.userSignal.set(user);
    // A non-global user always operates on their own company.
    this.tenantSignal.set(user.isGlobalAdmin ? this.tenantSignal() : user.tenantId);
    // The authenticated preference overrides cache and browser locale.
    this.language.applyUser(user);
  }

  patchUser(user: AuthUser): void {
    this.userSignal.set(user);
    this.language.applyUser(user);
  }

  selectTenant(tenantId: string | null): void {
    // Language belongs to the user, never to the tenant: switching company must
    // not touch the active locale.
    this.tenantSignal.set(tenantId);
  }

  clear(): void {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    this.tenantSignal.set(null);
    // Keeps the last UI locale in the guest cache so the login page stays
    // localized; only the authenticated state is dropped.
    this.language.resetToGuestLocale();
  }

  hasPermission(permission: string): boolean {
    const user = this.userSignal();
    if (!user) return false;
    return user.isGlobalAdmin || user.permissions.includes(permission);
  }
}
