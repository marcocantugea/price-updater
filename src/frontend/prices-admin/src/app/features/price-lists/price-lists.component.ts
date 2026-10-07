import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ModalComponent } from '../../shared/modal.component';
import { CurrencyService, MarketplaceService, PriceListService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { currencyOptionLoader, recordStatusOptions } from '../../core/utils/options';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import type { ColumnConfig, FieldConfig, PayloadMapper, RowAction } from '../../shared/crud-page.types';
import type { Marketplace, PriceList } from '../../core/models';

@Component({
  selector: 'app-price-lists',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, CrudPageComponent, ModalComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'priceLists.title' }"
      [subtitle]="{ key: 'priceLists.subtitle' }"
      [entityLabel]="{ key: 'priceLists.entity' }"
      [searchPlaceholder]="{ key: 'priceLists.searchPlaceholder' }"
      [emptyMessage]="{ key: 'priceLists.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('price-lists:create')"
      [canEdit]="can('price-lists:update')"
      [canDelete]="can('price-lists:delete')"
      [rowActions]="rowActions"
    />
    <app-modal
      [open]="marketplacesOpen()"
      [title]="'priceLists.modal.title' | transloco"
      [subtitle]="'priceLists.modal.subtitle' | transloco"
      (closed)="closeMarketplaces()"
    >
      @if (marketplacesOpen()) {
        <div class="space-y-4">
          <p class="text-sm text-olive">
            {{ 'priceLists.modal.list' | transloco }}:
            <span class="font-medium text-forest">{{ selectedPriceList()?.name }}</span>
          </p>
          <div class="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line p-3">
            @for (marketplace of availableMarketplaces(); track marketplace.id) {
              <label class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-forest hover:bg-sidebar">
                <input type="checkbox" [checked]="selectedMarketplaceIds().has(marketplace.id)" (change)="toggleMarketplace(marketplace.id)" />
                <span>{{ marketplace.name }}</span>
              </label>
            } @empty { <p class="text-sm text-olive">{{ 'priceLists.modal.empty' | transloco }}</p> }
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-md border border-line px-4 py-2 text-sm text-forest" (click)="closeMarketplaces()">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="button" class="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" [disabled]="marketplacesSaving()" (click)="saveMarketplaces()">
              {{ marketplacesSaving() ? ('common.saving' | transloco) : ('priceLists.modal.save' | transloco) }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class PriceListsComponent {
  readonly service = inject(PriceListService);
  private readonly currencyService = inject(CurrencyService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly text = inject(DisplayTextService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'description', label: { key: 'common.description' } },
    { key: 'currencyCode', label: { key: 'common.currency' } },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'priceLists.fields.namePlaceholder' }
    },
    {
      key: 'description',
      label: { key: 'common.description' },
      type: 'text',
      placeholder: { key: 'priceLists.fields.descriptionPlaceholder' }
    },
    {
      key: 'currencyCode',
      label: { key: 'common.currency' },
      type: 'select',
      optionsKey: 'currencies',
      help: { key: 'priceLists.fields.currencyHelp' }
    },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    }
  ];

  readonly selectSources = {
    currencies: currencyOptionLoader(this.currencyService)
  };

  readonly marketplacesOpen = signal(false);
  readonly marketplacesSaving = signal(false);
  readonly selectedPriceList = signal<PriceList | null>(null);
  readonly availableMarketplaces = signal<Marketplace[]>([]);
  readonly selectedMarketplaceIds = signal<Set<string>>(new Set());

  readonly rowActions: RowAction[] = [
    {
      label: { key: 'priceLists.rowActions.marketplaces' },
      visible: () => this.can('price-lists:update'),
      run: (row) => this.openMarketplaces(row)
    }
  ];

  /** The optional currency select sends '' when unset; the API expects null. */
  readonly mapToPayload: PayloadMapper = (values) => ({
    ...values,
    currencyCode: values['currencyCode'] ? values['currencyCode'] : null
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  openMarketplaces(priceList: PriceList): void {
    this.selectedPriceList.set(priceList);
    this.marketplacesOpen.set(true);
    this.selectedMarketplaceIds.set(new Set(priceList.priceListMarketplaces?.map((row) => row.marketplace.id) ?? []));

    this.marketplaceService.list({ limit: 100, status: 'active', sort: 'name', order: 'asc' }).subscribe({
      next: (response) => this.availableMarketplaces.set(response.data),
      error: () => this.availableMarketplaces.set([])
    });
    this.service.get(priceList.id).subscribe({
      next: (current) => this.selectedMarketplaceIds.set(new Set(current.priceListMarketplaces?.map((row) => row.marketplace.id) ?? [])),
      error: (error) => this.toast.error(this.errorLocalizer.message(error, { fallbackKey: 'priceLists.errors.load' }))
    });
  }

  toggleMarketplace(id: string): void {
    const next = new Set(this.selectedMarketplaceIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedMarketplaceIds.set(next);
  }

  saveMarketplaces(): void {
    const priceList = this.selectedPriceList();
    if (!priceList) return;
    this.marketplacesSaving.set(true);
    this.service.setMarketplaces(priceList.id, [...this.selectedMarketplaceIds()]).subscribe({
      next: () => {
        this.marketplacesSaving.set(false);
        this.marketplacesOpen.set(false);
        this.toast.success(this.text.translate('priceLists.toasts.saved'));
      },
      error: (error) => {
        this.marketplacesSaving.set(false);
        this.toast.error(this.errorLocalizer.message(error, { fallbackKey: 'priceLists.errors.save' }));
      }
    });
  }

  closeMarketplaces(): void {
    this.marketplacesOpen.set(false);
    this.selectedPriceList.set(null);
    this.availableMarketplaces.set([]);
  }
}
