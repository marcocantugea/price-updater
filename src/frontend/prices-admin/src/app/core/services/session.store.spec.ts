import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session.store';
import { LanguageService, UI_LOCALE_STORAGE_KEY } from '../i18n/language.service';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import type { AuthUser } from '../models';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
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

describe('SessionStore', () => {
  let store: SessionStore;
  let language: LanguageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
    installTestTranslations();
    store = TestBed.inject(SessionStore);
    language = TestBed.inject(LanguageService);
    store.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts empty', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.user()).toBeNull();
    expect(store.accessToken()).toBeNull();
  });

  it('stores the session and derives state', () => {
    store.setSession('token-1', user());

    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe('token-1');
    expect(store.permissions()).toEqual(['products:read']);
    expect(store.isGlobalAdmin()).toBe(false);
    expect(store.tenantId()).toBe('tenant-1');
  });

  it('uses the JWT tenant for a non-global user', () => {
    store.setSession('token-1', user({ tenantId: 'tenant-9' }));
    expect(store.activeTenantId()).toBe('tenant-9');
  });

  it('keeps the selected company for a global admin', () => {
    store.setSession('token-1', user({ isGlobalAdmin: true, tenantId: null }));
    expect(store.activeTenantId()).toBeNull();

    store.selectTenant('tenant-42');
    store.setSession('token-2', user({ isGlobalAdmin: true, tenantId: null }));
    expect(store.activeTenantId()).toBe('tenant-42');
  });

  it('ignores a cross-tenant selection for non-global users', () => {
    store.setSession('token-1', user({ tenantId: 'tenant-1' }));
    store.selectTenant('tenant-99');
    // setSession re-applies the JWT tenant on the next login.
    store.setSession('token-2', user({ tenantId: 'tenant-1' }));
    expect(store.activeTenantId()).toBe('tenant-1');
  });

  it('grants every permission to the global admin', () => {
    store.setSession('token-1', user({ isGlobalAdmin: true, permissions: [] }));

    expect(store.hasPermission('anything:at:all')).toBe(true);
  });

  it('checks permissions for regular users', () => {
    store.setSession('token-1', user({ permissions: ['products:read'] }));

    expect(store.hasPermission('products:read')).toBe(true);
    expect(store.hasPermission('products:delete')).toBe(false);
  });

  it('denies permissions without a session', () => {
    expect(store.hasPermission('products:read')).toBe(false);
  });

  it('patches the user without touching the token', () => {
    store.setSession('token-1', user());
    store.patchUser(user({ name: 'Renamed' }));

    expect(store.user()?.name).toBe('Renamed');
    expect(store.accessToken()).toBe('token-1');
  });

  it('clears the session', () => {
    store.setSession('token-1', user({ isGlobalAdmin: true }));
    store.selectTenant('tenant-42');
    store.clear();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.user()).toBeNull();
    expect(store.activeTenantId()).toBeNull();
  });

  // --- locale synchronisation ---------------------------------------------

  it('applies the authenticated locale on setSession', () => {
    store.setSession('token-1', user({ preferredLocale: 'en-US' }));

    expect(language.activeLocale()).toBe('en-US');
  });

  it('applies the locale on patchUser', () => {
    store.setSession('token-1', user({ preferredLocale: 'es-419' }));
    expect(language.activeLocale()).toBe('es-419');

    store.patchUser(user({ preferredLocale: 'en-US' }));

    expect(language.activeLocale()).toBe('en-US');
    expect(store.user()?.preferredLocale).toBe('en-US');
  });

  it('falls back to the default when the API sends an unknown locale', () => {
    store.setSession('token-1', user({ preferredLocale: 'es-MX' as never }));

    expect(language.activeLocale()).toBe('es-419');
  });

  it('never changes the locale when the tenant is switched', () => {
    store.setSession('token-1', user({ isGlobalAdmin: true, tenantId: null, preferredLocale: 'en-US' }));

    store.selectTenant('tenant-42');
    store.selectTenant('tenant-7');
    store.selectTenant(null);

    expect(language.activeLocale()).toBe('en-US');
  });

  it('keeps the guest locale on clear but drops the authenticated state', () => {
    store.setSession('token-1', user({ preferredLocale: 'en-US' }));
    store.clear();

    // The stored preference survives so the login page stays localized.
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en-US');
    expect(language.activeLocale()).toBe('en-US');
    expect(store.user()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });
});
