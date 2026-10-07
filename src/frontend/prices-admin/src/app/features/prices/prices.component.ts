import { Component, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { CrudPageComponent } from '../../shared/crud-page.component';
import {
  CurrencyService,
  MarketplaceService,
  PriceListService,
  ProductService
} from '../../core/services/catalog.services';
import { PriceService } from '../../core/services/price.service';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, idOptionLoader, recordStatusOptions } from '../../core/utils/options';
import { toDateOnlyInputValue } from '../../core/utils/format';
import { LocaleFormattingService } from '../../core/i18n/locale-formatting.service';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import type {
  AsyncOptionLoader,
  ColumnConfig,
  FieldConfig,
  PayloadMapper,
  PreviewRunner,
  PreviewResult
} from '../../shared/crud-page.types';

@Component({
  selector: 'app-prices',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'prices.title' }"
      [subtitle]="{ key: 'prices.subtitle' }"
      [entityLabel]="{ key: 'prices.entity' }"
      [searchPlaceholder]="{ key: 'prices.searchPlaceholder' }"
      [emptyMessage]="{ key: 'prices.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [asyncSelectSources]="asyncSelectSources"
      [previewRunner]="previewRunner"
      [previewLabel]="{ key: 'prices.preview.label' }"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('prices:create')"
      [canEdit]="can('prices:update')"
      [canDelete]="can('prices:delete')"
    />
  `
})
export class PricesComponent {
  readonly service = inject(PriceService);
  private readonly productService = inject(ProductService);
  private readonly priceListService = inject(PriceListService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);
  private readonly formatting = inject(LocaleFormattingService);
  private readonly text = inject(DisplayTextService);

  readonly columns: ColumnConfig[] = [
    { key: 'product.name', label: { key: 'common.product' }, sortable: false },
    { key: 'priceList.name', label: { key: 'prices.columns.list' } },
    { key: 'marketplace.name', label: { key: 'common.marketplace' } },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'finalPrice', label: { key: 'common.finalPrice' }, type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'startDate', label: { key: 'prices.columns.validFrom' }, type: 'date', dateOnly: true },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'productId',
      label: { key: 'common.product' },
      type: 'autocomplete',
      required: true,
      asyncOptionsKey: 'products',
      minLength: 4,
      placeholder: { key: 'prices.productSearchPlaceholder' },
      // References are immutable on update: show the linked product and make it
      // impossible to change. The control keeps the id for the preview.
      disabledOnEdit: true,
      initialOption: (row) =>
        row?.['product']
          ? {
              value: row['product'].id,
              // SKU and name are business data: shown exactly as entered.
              label: { text: `${row['product'].sku} — ${row['product'].name}` }
            }
          : null
    },
    { key: 'priceListId', label: { key: 'prices.fields.list' }, type: 'select', required: true, optionsKey: 'priceLists' },
    { key: 'marketplaceId', label: { key: 'common.marketplace' }, type: 'select', required: true, optionsKey: 'marketplaces' },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'currencyCode', label: { key: 'common.currency' }, type: 'select', required: true, optionsKey: 'currencies' },
    { key: 'startDate', label: { key: 'common.startDate' }, type: 'date', required: true },
    {
      key: 'endDate',
      label: { key: 'common.endDate' },
      type: 'date',
      help: { key: 'prices.fields.endDateHelp' }
    },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    },
    { key: 'notes', label: { key: 'common.notes' }, type: 'textarea', full: true }
  ];

  readonly selectSources = {
    priceLists: idOptionLoader(this.priceListService, 'name'),
    marketplaces: idOptionLoader(this.marketplaceService, 'name'),
    currencies: currencyOptionLoader(this.currencyService)
  };

  /**
   * Query-aware product source for the autocomplete field.
   *
   * The catalog is never preloaded: only active products matching the term are
   * requested, so there is no 100-product ceiling and no stale full catalog.
   */
  readonly asyncSelectSources: Record<string, AsyncOptionLoader> = {
    products: (term) =>
      this.productService.list({ search: term, status: 'active', page: 1, limit: 30 }).pipe(
        map((response) => ({
          data: response.data.map((product) => ({
            value: product.id,
            // SKU and name are business data: shown exactly as entered.
            label: { text: `${product.sku} — ${product.name}` }
          }))
        }))
      )
  };

  /** Converts API values into form values (dates need yyyy-MM-dd). */
  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    productId: row['productId'] ?? '',
    priceListId: row['priceListId'] ?? '',
    marketplaceId: row['marketplaceId'] ?? '',
    basePrice: row['basePrice'] ?? 0,
    currencyCode: row['currencyCode'] ?? 'MXN',
    startDate: toDateOnlyInputValue(row['startDate']),
    endDate: toDateOnlyInputValue(row['endDate']),
    status: row['status'] ?? 'active',
    notes: row['notes'] ?? ''
  });

  /** Converts form values into the API payload (dates back to ISO). */
  readonly mapToPayload: PayloadMapper = (values, context) => {
    const payload: Record<string, unknown> = { ...values };

    // References are immutable after creation: the API rejects them on update.
    if (context.isEditing) {
      delete payload['productId'];
      delete payload['priceListId'];
      delete payload['marketplaceId'];
    }

    if (values['startDate']) {
      payload['startDate'] = String(values['startDate']);
    }
    payload['endDate'] = values['endDate']
      ? String(values['endDate'])
      : null;
    return payload;
  };

  /** Calls POST /prices/calculate and renders the single applied discount. */
  readonly previewRunner: PreviewRunner = (values) => {
    const currencyCode = String(values['currencyCode'] ?? 'MXN');

    return this.service
      .calculate({
        productId: String(values['productId'] ?? ''),
        priceListId: String(values['priceListId'] ?? ''),
        marketplaceId: String(values['marketplaceId'] ?? ''),
        basePrice: Number(values['basePrice'] ?? 0),
        currencyCode
      })
      .pipe(
        map((result): PreviewResult[] => [
          {
            label: { key: 'prices.preview.basePrice' },
            value: { text: this.formatting.formatMoney(result.basePrice, currencyCode) }
          },
          {
            label: { key: 'prices.preview.discount' },
            // The discount name is business data; the "none" case is copy.
            value: result.appliedDiscount
              ? { text: result.appliedDiscount.name }
              : { key: 'prices.preview.none' },
            hint: result.appliedDiscount
              ? {
                  key: 'prices.preview.discountHint',
                  params: {
                    scope: this.scopeLabel(result.scope),
                    amount: this.formatting.formatMoney(result.discountAmount, currencyCode)
                  }
                }
              : { key: 'prices.preview.basePriceUsed' }
          },
          {
            label: { key: 'prices.preview.finalPrice' },
            value: { text: this.formatting.formatMoney(result.finalPrice, currencyCode) }
          }
        ])
      );
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  // --- internals -----------------------------------------------------------

  /** Translates a discount scope code, keeping the raw code as the fallback. */
  private scopeLabel(scope: string): string {
    const key = `discountScope.${scope}`;
    return this.text.has(key) ? this.text.translate(key) : scope;
  }
}
