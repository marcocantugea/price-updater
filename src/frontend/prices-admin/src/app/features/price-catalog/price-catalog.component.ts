import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { PriceCatalogService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { LocaleFormattingService } from '../../core/i18n/locale-formatting.service';
import type { CatalogRow, ExportRequest, Marketplace, PriceList } from '../../core/models';

@Component({
  selector: 'app-price-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  template: `
    <section class="space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-olive">{{ 'priceCatalog.eyebrow' | transloco }}</p>
          <h1 class="text-2xl font-semibold text-forest">{{ 'priceCatalog.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-olive">{{ 'priceCatalog.subtitle' | transloco }}</p>
        </div>
        <div class="flex gap-2">
          <select class="pg-input min-w-44" [ngModel]="selectedFormat()" (ngModelChange)="selectedFormat.set($event)" [attr.aria-label]="'priceCatalog.aria.exportFormat' | transloco">
            <option value="csv">{{ 'exportFormat.csv' | transloco }}</option>
            <option value="json">{{ 'exportFormat.json' | transloco }}</option>
            <option value="txt">{{ 'exportFormat.txt' | transloco }}</option>
          </select>
          <button type="button" class="rounded-md bg-forest px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" [disabled]="!canExport() || !selectedListId() || !selectedMarketplaceId() || exporting()" (click)="requestExport()">
            {{ exporting() ? ('priceCatalog.actions.exporting' | transloco) : ('priceCatalog.actions.export' | transloco) }}
          </button>
        </div>
      </div>

      <div class="pg-card grid gap-4 p-4 md:grid-cols-[1fr_1fr_1.4fr]">
        <label class="pg-label mb-0">{{ 'priceCatalog.fields.priceList.label' | transloco }}
          <select class="pg-input mt-1" [ngModel]="selectedListId()" (ngModelChange)="onListChange($event)">
            <option value="">{{ 'priceCatalog.fields.priceList.placeholder' | transloco }}</option>
            @for (list of priceLists(); track list.id) { <option [value]="list.id">{{ list.name }}</option> }
          </select>
        </label>
        <label class="pg-label mb-0">{{ 'priceCatalog.fields.marketplace.label' | transloco }}
          <select class="pg-input mt-1" [disabled]="!selectedListId() || loadingMarketplaces()" [ngModel]="selectedMarketplaceId()" (ngModelChange)="onMarketplaceChange($event)">
            <option value="">{{ 'priceCatalog.fields.marketplace.placeholder' | transloco }}</option>
            @for (marketplace of marketplaces(); track marketplace.id) { <option [value]="marketplace.id">{{ marketplace.name }}</option> }
          </select>
        </label>
        <label class="pg-label mb-0">{{ 'priceCatalog.fields.search.label' | transloco }}
          <input class="pg-input mt-1" type="search" [placeholder]="'priceCatalog.fields.search.placeholder' | transloco" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </label>
      </div>

      @if (error()) { <div class="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{{ error() }}</div> }

      <div class="pg-card overflow-hidden">
        @if (loading()) {
          <div class="p-10 text-center text-sm text-olive">{{ 'priceCatalog.loading' | transloco }}</div>
        } @else if (!selectedListId() || !selectedMarketplaceId()) {
          <div class="p-10 text-center text-sm text-olive">{{ 'priceCatalog.selectPrompt' | transloco }}</div>
        } @else if (rows().length === 0) {
          <div class="p-10 text-center text-sm text-olive">{{ 'priceCatalog.empty' | transloco }}</div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[900px] text-left text-sm">
              <thead class="border-b border-line bg-sidebar/40 text-xs uppercase tracking-wide text-olive">
                <tr><th class="px-4 py-3">{{ 'priceCatalog.columns.product' | transloco }}</th><th class="px-4 py-3">{{ 'priceCatalog.columns.sku' | transloco }}</th><th class="px-4 py-3 text-right">{{ 'priceCatalog.columns.basePrice' | transloco }}</th><th class="px-4 py-3">{{ 'priceCatalog.columns.appliedDiscount' | transloco }}</th><th class="px-4 py-3 text-right">{{ 'priceCatalog.columns.discount' | transloco }}</th><th class="px-4 py-3 text-right">{{ 'priceCatalog.columns.finalPrice' | transloco }}</th></tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.product.id) {
                  <tr class="border-b border-line last:border-0">
                    <td class="px-4 py-3 font-medium text-forest">{{ row.product.name }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-olive">{{ row.product.sku }}</td>
                    <td class="px-4 py-3 text-right text-olive">{{ formatting.formatMoney(row.basePrice, row.currencyCode) }}</td>
                    <td class="px-4 py-3">{{ row.appliedDiscount?.name ?? ('priceCatalog.noDiscount' | transloco) }}</td>
                    <td class="px-4 py-3 text-right text-olive">{{ formatting.formatNumber(row.discountAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} {{ row.currencyCode }}</td>
                    <td class="px-4 py-3 text-right font-semibold text-forest">{{ formatting.formatMoney(row.finalPrice, row.currencyCode) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-olive">
            <span>{{ 'priceCatalog.productsCount' | transloco: { count: meta().total } }}</span>
            <div class="flex gap-2"><button type="button" class="rounded border border-line px-3 py-1 disabled:opacity-40" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">{{ 'common.previous' | transloco }}</button><span>{{ 'priceCatalog.pagination' | transloco: { page: page(), totalPages: meta().totalPages || 1 } }}</span><button type="button" class="rounded border border-line px-3 py-1 disabled:opacity-40" [disabled]="page() >= meta().totalPages" (click)="goToPage(page() + 1)">{{ 'common.next' | transloco }}</button></div>
          </div>
        }
      </div>

      @if (canExport()) {
        <div class="pg-card overflow-hidden">
          <div class="border-b border-line px-4 py-3"><h2 class="font-semibold text-forest">{{ 'priceCatalog.exports.title' | transloco }}</h2><p class="text-xs text-olive">{{ 'priceCatalog.exports.subtitle' | transloco }}</p></div>
          <div class="divide-y divide-line">
            @for (job of exports(); track job.id) {
              <div class="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><span class="font-medium text-forest">{{ exportFormatLabel(job.format) }}</span><span class="ml-2 text-xs text-olive">{{ formatting.formatDate(job.createdAt, { withTime: true }) }}</span></div><div class="flex items-center gap-3"><span class="text-xs text-olive">{{ exportStatusLabel(job.status) }}</span><button type="button" class="text-forest underline disabled:text-olive/50" [disabled]="job.status !== 'completed'" (click)="download(job)">{{ 'priceCatalog.actions.download' | transloco }}</button></div></div>
            } @empty { <div class="px-4 py-5 text-sm text-olive">{{ 'priceCatalog.exports.empty' | transloco }}</div> }
          </div>
        </div>
      }
    </section>
  `
})
export class PriceCatalogComponent implements OnInit {
  private readonly service = inject(PriceCatalogService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly text = inject(DisplayTextService);
  /** Public because the template renders money, amounts and dates with it. */
  readonly formatting = inject(LocaleFormattingService);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  readonly session = inject(SessionStore);
  readonly priceLists = signal<PriceList[]>([]);
  readonly marketplaces = signal<Marketplace[]>([]);
  readonly rows = signal<CatalogRow[]>([]);
  readonly exports = signal<ExportRequest[]>([]);
  readonly selectedListId = signal('');
  readonly selectedMarketplaceId = signal('');
  readonly selectedFormat = signal<'csv' | 'json' | 'txt'>('csv');
  readonly search = signal('');
  readonly page = signal(1);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly loadingMarketplaces = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);

  canExport(): boolean {
    return this.session.hasPermission('price-catalog:export');
  }

  /** Export status is an API code; an unknown code stays visible instead of blanking. */
  exportStatusLabel(status: string): string {
    const key = `exportStatus.${status}`;
    return this.text.has(key) ? this.text.translate(key) : status;
  }

  /** Export format is an API code; an unknown code falls back to its raw token. */
  exportFormatLabel(format: string): string {
    const key = `exportFormat.${format}`;
    return this.text.has(key) ? this.text.translate(key) : format.toUpperCase();
  }

  ngOnInit(): void {
    this.loadPriceLists();
    if (this.canExport()) this.loadExports();
    this.tenantContext.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.selectedListId.set('');
      this.selectedMarketplaceId.set('');
      this.priceLists.set([]);
      this.marketplaces.set([]);
      this.rows.set([]);
      this.loadPriceLists();
      if (this.canExport()) this.loadExports();
    });
  }

  private loadPriceLists(): void {
    this.service.priceLists().subscribe({
      next: (lists) => {
        this.priceLists.set(lists);
        if (!lists.some((list) => list.id === this.selectedListId())) {
          this.onListChange(lists[0]?.id ?? '');
        }
      },
      error: (e) => this.error.set(this.errorLocalizer.message(e))
    });
  }

  onListChange(id: string): void {
    this.selectedListId.set(id);
    this.selectedMarketplaceId.set('');
    this.marketplaces.set([]);
    this.rows.set([]);
    if (!id) return;
    this.loadingMarketplaces.set(true);
    this.service.marketplaces(id).subscribe({
      next: (items) => {
        this.marketplaces.set(items);
        this.loadingMarketplaces.set(false);
        this.onMarketplaceChange(items[0]?.id ?? '');
      },
      error: (e) => {
        this.loadingMarketplaces.set(false);
        this.error.set(this.errorLocalizer.message(e));
      }
    });
  }

  onMarketplaceChange(id: string): void { this.selectedMarketplaceId.set(id); this.page.set(1); this.loadRows(); }
  onSearch(value: string): void { this.search.set(value); this.page.set(1); this.loadRows(); }
  goToPage(page: number): void { if (page < 1 || page > this.meta().totalPages) return; this.page.set(page); this.loadRows(); }

  private loadRows(): void {
    if (!this.selectedListId() || !this.selectedMarketplaceId()) return;
    this.loading.set(true);
    this.service.list({ priceListId: this.selectedListId(), marketplaceId: this.selectedMarketplaceId(), search: this.search(), page: this.page(), limit: 20 }).subscribe({
      next: (response) => {
        this.rows.set(response.data);
        this.meta.set(response.meta);
        this.loading.set(false);
      },
      error: (e) => {
        this.rows.set([]);
        this.loading.set(false);
        this.error.set(this.errorLocalizer.message(e));
      }
    });
  }

  requestExport(): void {
    this.exporting.set(true);
    this.service.requestExport({ priceListId: this.selectedListId(), marketplaceId: this.selectedMarketplaceId(), format: this.selectedFormat(), search: this.search() || undefined }).subscribe({ next: () => { this.exporting.set(false); this.toast.success(this.text.translate('priceCatalog.toasts.exportQueued')); this.loadExports(); this.startPolling(); }, error: (e) => { this.exporting.set(false); this.toast.error(this.errorLocalizer.message(e)); } });
  }

  loadExports(): void { this.service.exports().subscribe({ next: (jobs) => this.exports.set(jobs), error: () => this.exports.set([]) }); }

  private startPolling(): void {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => { this.loadExports(); if (!this.exports().some((job) => job.status === 'queued' || job.status === 'processing')) { clearInterval(this.pollHandle!); this.pollHandle = null; } }, 3000);
  }

  download(job: ExportRequest): void {
    this.service.downloadExport(job.id).subscribe({ next: (response) => { const blob = response.body; if (!blob) return; const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = job.fileName ?? `price-catalog.${job.format}`; anchor.click(); URL.revokeObjectURL(url); }, error: (e) => this.toast.error(this.errorLocalizer.message(e)) });
  }
}
