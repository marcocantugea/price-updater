import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../core/services/auth.service';
import { SessionStore } from '../core/services/session.store';
import { TenantContextService } from '../core/services/tenant-context.service';
import { TenantService } from '../core/services/access.services';
import { ToastService } from '../core/services/toast.service';
import { UserPreferencesService } from '../core/services/user-preferences.service';
import { LanguageService } from '../core/i18n/language.service';
import { ApiErrorLocalizerService } from '../core/i18n/api-error-localizer.service';
import { localeMetadata, type SupportedLocale } from '../core/i18n/supported-locales';
import { LanguageSelectorComponent } from '../shared/language-selector.component';
import { ToastHostComponent } from '../shared/toast-host.component';
import type { Tenant } from '../core/models';

interface NavItem {
  /**
   * Catalog key, not resolved copy: navigation must follow a runtime language
   * switch, which is impossible with strings resolved at construction time.
   */
  labelKey: string;
  path: string;
  icon: string;
  permission: string;
  globalOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideAngularModule,
    TranslocoPipe,
    LanguageSelectorComponent,
    ToastHostComponent
  ],
  templateUrl: './shell.component.html'
})
export class ShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly tenantService = inject(TenantService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly preferences = inject(UserPreferencesService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly session = inject(SessionStore);
  readonly language = inject(LanguageService);

  readonly sidebarOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly tenants = signal<Tenant[]>([]);
  /** True while the locale change is being persisted. */
  readonly savingLanguage = signal(false);

  /** Sidebar modules, in the order defined by the plan. */
  private readonly allNavItems: NavItem[] = [
    { labelKey: 'shell.nav.dashboard', path: '/dashboard', icon: 'layout-dashboard', permission: 'dashboard:read' },
    { labelKey: 'shell.nav.priceCatalog', path: '/price-catalog', icon: 'scan-search', permission: 'price-catalog:read' },
    { labelKey: 'shell.nav.companies', path: '/companies', icon: 'building-2', permission: 'tenants:read', globalOnly: true },
    { labelKey: 'shell.nav.products', path: '/products', icon: 'package', permission: 'products:read' },
    { labelKey: 'shell.nav.priceLists', path: '/price-lists', icon: 'tags', permission: 'price-lists:read' },
    { labelKey: 'shell.nav.marketplaces', path: '/marketplaces', icon: 'store', permission: 'marketplaces:read' },
    { labelKey: 'shell.nav.prices', path: '/prices', icon: 'dollar-sign', permission: 'prices:read' },
    { labelKey: 'shell.nav.discounts', path: '/discounts', icon: 'percent', permission: 'discounts:read' },
    { labelKey: 'shell.nav.priceHistory', path: '/price-history', icon: 'history', permission: 'price-history:read' },
    { labelKey: 'shell.nav.apiKeys', path: '/api-keys', icon: 'key-round', permission: 'api-keys:read' },
    { labelKey: 'shell.nav.users', path: '/users', icon: 'users', permission: 'users:read' },
    { labelKey: 'shell.nav.roles', path: '/roles', icon: 'shield-check', permission: 'roles:read' },
    { labelKey: 'shell.nav.settings', path: '/settings', icon: 'settings', permission: 'settings:read' }
  ];

  readonly navItems = computed(() =>
    this.allNavItems.filter((item) => {
      if (item.globalOnly && !this.session.isGlobalAdmin()) return false;
      return this.session.hasPermission(item.permission);
    })
  );

  /** Empty when signed out; the template renders the localized guest label. */
  readonly userName = computed(() => this.session.user()?.name ?? '');
  readonly userRole = computed(() => this.session.user()?.roleSlug ?? '');
  readonly initials = computed(() => {
    const name = this.userName();
    if (name === '') return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });
  readonly activeTenantName = computed(() => this.tenants().find((tenant) => tenant.id === this.session.activeTenantId())?.commercialName ?? '');

  /**
   * The language label is the first thing to collapse when a competing header
   * control needs the room: a global administrator also renders the company
   * selector, so the label waits until `lg`.
   */
  readonly languageLabelClass = computed(() =>
    this.session.isGlobalAdmin() ? 'hidden lg:inline' : 'hidden md:inline'
  );

  ngOnInit(): void {
    if (this.session.isGlobalAdmin()) {
      this.loadTenants();
    }
  }

  private loadTenants(): void {
    this.tenantService.list({ limit: 100, sort: 'commercialName', order: 'asc' }).subscribe({
      next: (response) => {
        this.tenants.set(response.data);
        // Auto-select the first company so tenant-scoped screens work immediately.
        if (!this.session.activeTenantId() && response.data.length > 0) {
          this.tenantContext.select(response.data[0].id);
        }
      },
      error: () => this.tenants.set([])
    });
  }

  onTenantChange(value: string): void {
    // Language belongs to the user, so switching company never touches it.
    this.tenantContext.select(value === '' ? null : value);
  }

  /**
   * Applies the locale optimistically, persists it, and rolls back on failure.
   *
   * The UI switches immediately (no reload); if the API rejects the change, the
   * previous language is restored and the error is reported in that language,
   * so the message is always readable.
   */
  changeLanguage(locale: SupportedLocale): void {
    if (this.savingLanguage()) return;

    const previous = this.language.activeLocale();
    if (locale === previous) return;

    this.language.setLocale(locale);
    this.savingLanguage.set(true);

    this.preferences.updateLocale(locale).subscribe({
      next: (user) => {
        this.savingLanguage.set(false);
        // The server response is authoritative: it also refreshes the guest cache.
        this.session.patchUser(user);
      },
      error: (error: unknown) => {
        this.savingLanguage.set(false);
        this.language.setLocale(previous);
        this.toast.error(
          this.errorLocalizer.message(error, {
            fallbackKey: 'language.saveFailed',
            params: { language: this.localeName(previous) }
          })
        );
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login'])
    });
  }

  private localeName(locale: SupportedLocale): string {
    const key = localeMetadata(locale).fullLabelKey;
    const translated = this.transloco.translate(key);
    return typeof translated === 'string' && translated !== '' && translated !== key
      ? translated
      : locale;
  }
}
