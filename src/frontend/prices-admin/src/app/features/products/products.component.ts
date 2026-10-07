import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ProductService, CurrencyService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, recordStatusOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper, RowAction } from '../../shared/crud-page.types';
import type { Product } from '../../core/models';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'products.title' }"
      [subtitle]="{ key: 'products.subtitle' }"
      [entityLabel]="{ key: 'products.entity' }"
      [searchPlaceholder]="{ key: 'products.searchPlaceholder' }"
      [emptyMessage]="{ key: 'products.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [mapToPayload]="mapToPayload"
      [rowActions]="rowActions"
      [canCreate]="can('products:create')"
      [canEdit]="can('products:update')"
      [canDelete]="can('products:delete')"
    />
  `
})
export class ProductsComponent {
  readonly service = inject(ProductService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /**
   * The specification lives on its own page, because it is an aggregate with
   * nested collections that the generic modal cannot model. Products only
   * supplies the entry point.
   *
   * `products:read` is enough to open it — the page renders read-only without
   * `products:update`, which is what lets a read-only user inspect the data.
   */
  readonly rowActions: RowAction[] = [
    {
      label: { key: 'products.rowActions.specification' },
      run: (row: Product) => void this.router.navigate(['/products', row.id, 'specification'])
    }
  ];

  readonly columns: ColumnConfig[] = [
    { key: 'sku', label: { key: 'products.columns.sku' }, sortable: true },
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'money', currencyKey: 'currencyCode', align: 'right' },
    // Rendered with the same currency as the base price. A missing cost shows as
    // an em dash, never as 0: `null` means "not captured", 0 is a real cost.
    { key: 'cost', label: { key: 'common.cost' }, type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'currencyCode', label: { key: 'common.currency' } },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'sku', label: { key: 'products.columns.sku' }, type: 'text', required: true, placeholder: { text: 'SKU-001' } },
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'products.fields.namePlaceholder' }
    },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'number', required: true, min: 0, step: 0.01 },
    {
      // Optional on purpose: leaving it empty means "cost not captured".
      key: 'cost',
      label: { key: 'common.cost' },
      type: 'number',
      min: 0,
      step: 0.01,
      placeholder: { key: 'products.fields.costPlaceholder' },
      help: { key: 'products.fields.costHelp' }
    },
    { key: 'currencyCode', label: { key: 'common.currency' }, type: 'select', required: true, optionsKey: 'currencies' },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    },
    { key: 'description', label: { key: 'common.description' }, type: 'textarea', full: true }
  ];

  readonly selectSources = {
    currencies: currencyOptionLoader(this.currencyService)
  };

  /**
   * The cost input is a number control, so clearing it yields `''` and not
   * `null`. The API rejects `''` (422) and distinguishes `null` ("not captured")
   * from `0` (a real cost), so the empty string is normalized here instead of
   * relying on numeric coercion. Omitting the field entirely would send
   * `undefined`, which the API cannot tell apart from "leave it alone" on an
   * update, so a cleared cost must be sent explicitly as null.
   */
  readonly mapToPayload: PayloadMapper = (values) => ({
    ...values,
    cost: values['cost'] === '' || values['cost'] === null || values['cost'] === undefined
      ? null
      : Number(values['cost'])
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
