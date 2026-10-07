import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencyService } from '../../core/services/catalog.services';
import { TenantService } from '../../core/services/access.services';
import { ToastService } from '../../core/services/toast.service';
import { Currency, Tenant } from '../../core/models';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { LocaleFormattingService } from '../../core/i18n/locale-formatting.service';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { LucideAngularModule } from 'lucide-angular';
import { SessionStore } from '../../core/services/session.store';
import { listTimeZoneOptions } from '../../core/utils/time-zones';

/**
 * Settings: read-only currency catalog (phase 1), the company time zone, and the
 * two navigation sections that open the catalog screens.
 *
 * The page is reachable without a selected company, because a global
 * administrator needs the global "Units of measure" section from that state. In
 * it, every tenant panel is skipped: `/tenants/me` and `/currencies` are
 * tenant-scoped requests that would fail with `TENANT_REQUIRED`.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [StatePanelComponent, StatusBadgeComponent, LucideAngularModule, TranslocoPipe],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnDestroy {
  private readonly currencyService = inject(CurrencyService);
  private readonly tenantService = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly text = inject(DisplayTextService);
  private readonly router = inject(Router);
  /** Public because the template formats the clock and the currency names with it. */
  readonly formatting = inject(LocaleFormattingService);
  readonly session = inject(SessionStore);

  /**
   * True only once the session is known **and** a company applies.
   *
   * `session.user()` is null while the session is being restored (the guard
   * refreshes the cookie on a hard load), so an unknown session is treated as
   * "no tenant context" on purpose: firing `/currencies` or `/tenants/me` before
   * the access token exists answers `401`, and the interceptor's refresh then
   * races with the guard's — which the API correctly answers as
   * `REFRESH_TOKEN_REUSED` and the user is signed out.
   */
  readonly hasTenantContext = computed(() => {
    if (!this.session.user()) return false;

    return !this.session.isGlobalAdmin() || this.session.activeTenantId() !== null;
  });
  /** Guards against loading the tenant panels more than once. */
  private tenantPanelsLoaded = false;

  constructor() {
    // Both the session and the selected company arrive asynchronously — and the
    // shell may auto-select the first company after this page is already open —
    // so the tenant panels follow the signal instead of being fetched once.
    effect(() => {
      if (!this.hasTenantContext() || this.tenantPanelsLoaded) return;

      this.tenantPanelsLoaded = true;
      this.loadTenantPanels();
    });
  }

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currencies = signal<Currency[]>([]);
  readonly tenant = signal<Tenant | null>(null);
  readonly selectedTimeZone = signal('UTC');
  readonly timeZoneSearch = signal('');
  readonly timeZoneSaving = signal(false);
  readonly timeZoneOptions = listTimeZoneOptions();
  readonly filteredTimeZoneOptions = computed(() => {
    const query = this.timeZoneSearch().trim().toLowerCase();
    if (!query) return this.timeZoneOptions;
    return this.timeZoneOptions.filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query));
  });
  /**
   * Business clock: the date and time are rendered in the tenant time zone,
   * which is an independent setting from the UI language, while their shape
   * follows the active locale. A malformed time zone coming from the API must
   * not break the panel, so it degrades to the browser time zone.
   */
  readonly currentBusinessTime = computed(() => {
    try {
      return this.formatting.formatDate(this.now(), {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: this.selectedTimeZone()
      });
    } catch {
      return this.formatting.formatDate(this.now(), { dateStyle: 'medium', timeStyle: 'short' });
    }
  });
  private readonly now = signal(new Date());
  private readonly clock = window.setInterval(() => this.now.set(new Date()), 60_000);

  /** Loads the panels that only make sense with a company. Runs at most once. */
  private loadTenantPanels(): void {
    this.currencyService.list({ limit: 100, sort: 'code', order: 'asc' }).subscribe({
      next: (response) => {
        this.currencies.set(response.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorLocalizer.message(error));
        this.loading.set(false);
      }
    });

    this.tenantService.me().subscribe({
      next: (tenant) => {
        this.tenant.set(tenant);
        this.selectedTimeZone.set(tenant.timeZone || 'UTC');
      },
      error: (error: unknown) => this.error.set(this.errorLocalizer.message(error))
    });
  }

  /** Opens the global supplier catalog; it needs no company. */
  openSuppliers(): void {
    void this.router.navigate(['/suppliers']);
  }

  /** Opens the global unit catalog; needs no company. */
  openUnitsOfMeasure(): void {
    void this.router.navigate(['/units-of-measure']);
  }

  saveTimeZone(): void {
    const timeZone = this.selectedTimeZone();
    this.timeZoneSaving.set(true);
    this.tenantService.updateTimeZone(timeZone).subscribe({
      next: (response) => {
        this.selectedTimeZone.set(response.timeZone);
        this.tenant.update((current) => current ? { ...current, timeZone: response.timeZone } : current);
        this.timeZoneSaving.set(false);
        this.toast.success(this.text.translate('settings.timeZone.updated'));
      },
      error: (error: unknown) => {
        this.timeZoneSaving.set(false);
        this.toast.error(this.errorLocalizer.message(error));
      }
    });
  }

  ngOnDestroy(): void {
    window.clearInterval(this.clock);
  }
}
