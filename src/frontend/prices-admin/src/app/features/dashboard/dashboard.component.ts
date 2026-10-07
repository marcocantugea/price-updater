import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';
import { BarChartModule, ScaleType, type Color } from '@swimlane/ngx-charts';
import { DashboardService } from '../../core/services/dashboard.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { SessionStore } from '../../core/services/session.store';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { MoneyPipe } from '../../core/pipes/money.pipe';
import { AppDatePipe } from '../../core/pipes/app-date.pipe';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import type { DashboardSummary, MarketplaceChartPoint, Price } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    TranslocoPipe,
    LucideAngularModule,
    BarChartModule,
    StatePanelComponent,
    StatusBadgeComponent,
    MoneyPipe,
    AppDatePipe
  ],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly tenantContext = inject(TenantContextService);
  readonly session = inject(SessionStore);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly recentPrices = signal<Price[]>([]);
  readonly chart = signal<MarketplaceChartPoint[]>([]);

  /** ngx-charts series derived from the marketplace aggregation. */
  readonly chartData = computed(() =>
    this.chart().map((point) => ({ name: point.name, value: point.priceCount }))
  );

  /** Palette aligned with the Price Updater design tokens. */
  readonly chartScheme: Color = {
    name: 'price-updater',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#7FA36B', '#314534', '#C6A15B', '#66745C', '#C96B5B']
  };

  ngOnInit(): void {
    this.load();

    this.tenantContext.changes.subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.dashboardService.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorLocalizer.message(error));
        this.loading.set(false);
      }
    });

    this.dashboardService.recentPrices(8).subscribe({
      next: (prices) => this.recentPrices.set(prices),
      error: () => this.recentPrices.set([])
    });

    this.dashboardService.pricesByMarketplace().subscribe({
      next: (points) => this.chart.set(points),
      error: () => this.chart.set([])
    });
  }

  barHeight(point: MarketplaceChartPoint): string {
    const max = Math.max(1, ...this.chart().map((item) => item.priceCount));
    return `${Math.round((point.priceCount / max) * 100)}%`;
  }

  /** Alerts: discounts expiring soon, as required by the dashboard spec. */
  expiringCount(): number {
    return this.summary()?.expiringDiscounts.length ?? 0;
  }

  isGlobalAdmin(): boolean {
    return this.session.isGlobalAdmin();
  }
}
