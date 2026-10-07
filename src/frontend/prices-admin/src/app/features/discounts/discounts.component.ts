import { Component, inject } from '@angular/core';
import { z } from 'zod';
import { CrudPageComponent } from '../../shared/crud-page.component';
import {
  DiscountService,
  MarketplaceService,
  PriceListService,
  ProductService
} from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { idOptionLoader, recordStatusOptions, staticOptions } from '../../core/utils/options';
import { toDateOnlyInputValue } from '../../core/utils/format';
import { zodValidator } from '../../core/utils/validation';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import type { ColumnConfig, DisplayText, FieldConfig } from '../../shared/crud-page.types';

/**
 * Cross-field rules for the discount form (mirrors the API validator):
 * exactly one scope reference matching `appliesTo`, percentage <= 100 and a
 * valid date range.
 *
 * Messages are **catalog keys**, not sentences: `CrudPageComponent` resolves a
 * field error through the catalog when the value is a known key, so the
 * validation copy follows a runtime language switch instead of freezing the
 * language that was active when the schema was built.
 */
const discountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'discounts.validation.nameRequired'),
    type: z.enum(['percentage', 'fixed']),
    value: z.coerce.number().nonnegative('discounts.validation.valueNonNegative'),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']),
    productId: z.string().optional().nullable(),
    priceListId: z.string().optional().nullable(),
    marketplaceId: z.string().optional().nullable(),
    startDate: z.string().min(1, 'discounts.validation.startRequired'),
    endDate: z.string().optional().nullable()
  })
  .superRefine((data, ctx) => {
    const scopeFields: Record<string, 'productId' | 'priceListId' | 'marketplaceId'> = {
      product: 'productId',
      price_list: 'priceListId',
      marketplace: 'marketplaceId'
    };

    for (const [scope, field] of Object.entries(scopeFields)) {
      const isSet = Boolean(data[field]);
      if (scope === data.appliesTo && !isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'discounts.validation.scopeRequired'
        });
      }
      if (scope !== data.appliesTo && isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'discounts.validation.scopeNotApplicable'
        });
      }
    }

    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'discounts.validation.percentageMax'
      });
    }

    if (data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'discounts.validation.endAfterStart'
      });
    }
  });

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'discounts.title' }"
      [subtitle]="{ key: 'discounts.subtitle' }"
      [entityLabel]="{ key: 'discounts.entity' }"
      [searchPlaceholder]="{ key: 'discounts.searchPlaceholder' }"
      [emptyMessage]="{ key: 'discounts.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [crossValidators]="crossValidators"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('discounts:create')"
      [canEdit]="can('discounts:update')"
      [canDelete]="can('discounts:delete')"
    />
  `
})
export class DiscountsComponent {
  readonly service = inject(DiscountService);
  private readonly productService = inject(ProductService);
  private readonly priceListService = inject(PriceListService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly session = inject(SessionStore);
  private readonly text = inject(DisplayTextService);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    // Enum codes: translated by their stable value, not by a formatted string.
    { key: 'type', label: { key: 'common.type' }, value: (row) => this.codeLabel('discountType', row?.['type']) },
    { key: 'value', label: { key: 'common.value' }, align: 'right' },
    { key: 'appliesTo', label: { key: 'discounts.columns.appliesTo' }, value: (row) => this.codeLabel('discountScope', row?.['appliesTo']) },
    { key: 'priority', label: { key: 'common.priority' }, align: 'right' },
    { key: 'startDate', label: { key: 'discounts.columns.start' }, type: 'date', dateOnly: true },
    { key: 'endDate', label: { key: 'discounts.columns.end' }, type: 'date', dateOnly: true },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'discounts.fields.namePlaceholder' }
    },
    {
      key: 'type',
      label: { key: 'discounts.fields.type' },
      type: 'select',
      required: true,
      defaultValue: 'percentage',
      options: staticOptions([
        ['percentage', { key: 'discountType.percentage' }],
        ['fixed', { key: 'discountType.fixed' }]
      ])
    },
    {
      key: 'value',
      label: { key: 'common.value' },
      type: 'number',
      required: true,
      min: 0,
      step: 0.01,
      help: { key: 'discounts.fields.valueHelp' }
    },
    {
      key: 'appliesTo',
      label: { key: 'discounts.fields.appliesTo' },
      type: 'select',
      required: true,
      defaultValue: 'product',
      options: staticOptions([
        ['product', { key: 'discountScope.product' }],
        ['price_list', { key: 'discountScope.price_list' }],
        ['marketplace', { key: 'discountScope.marketplace' }]
      ])
    },
    {
      key: 'productId',
      label: { key: 'discounts.fields.relatedProduct' },
      type: 'select',
      optionsKey: 'products',
      visibleWhen: { key: 'appliesTo', equals: 'product' }
    },
    {
      key: 'priceListId',
      label: { key: 'discounts.fields.relatedPriceList' },
      type: 'select',
      optionsKey: 'priceLists',
      visibleWhen: { key: 'appliesTo', equals: 'price_list' }
    },
    {
      key: 'marketplaceId',
      label: { key: 'discounts.fields.relatedMarketplace' },
      type: 'select',
      optionsKey: 'marketplaces',
      visibleWhen: { key: 'appliesTo', equals: 'marketplace' }
    },
    { key: 'startDate', label: { key: 'common.startDate' }, type: 'date', required: true },
    {
      key: 'endDate',
      label: { key: 'common.endDate' },
      type: 'date',
      help: { key: 'discounts.fields.endDateHelp' }
    },
    {
      key: 'priority',
      label: { key: 'common.priority' },
      type: 'number',
      min: 0,
      defaultValue: 100,
      help: { key: 'discounts.fields.priorityHelp' }
    },
    {
      key: 'status',
      label: { key: 'discounts.fields.active' },
      type: 'toggle',
      defaultValue: true,
      help: { key: 'discounts.fields.activeHelp' }
    },
    { key: 'description', label: { key: 'common.description' }, type: 'textarea', full: true }
  ];

  readonly selectSources = {
    products: idOptionLoader(this.productService, 'name'),
    priceLists: idOptionLoader(this.priceListService, 'name'),
    marketplaces: idOptionLoader(this.marketplaceService, 'name')
  };

  readonly crossValidators = [zodValidator(discountFormSchema)];

  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    name: row['name'] ?? '',
    type: row['type'] ?? 'percentage',
    value: Number(row['value'] ?? 0),
    appliesTo: row['appliesTo'] ?? 'product',
    productId: row['productId'] ?? '',
    priceListId: row['priceListId'] ?? '',
    marketplaceId: row['marketplaceId'] ?? '',
    startDate: toDateOnlyInputValue(row['startDate']),
    endDate: toDateOnlyInputValue(row['endDate']),
    priority: row['priority'] ?? 100,
    status: (row['status'] ?? 'active') === 'active',
    description: row['description'] ?? ''
  });

  readonly mapToPayload = (values: Record<string, unknown>): Record<string, unknown> => ({
    name: values['name'],
    type: values['type'],
    value: Number(values['value'] ?? 0),
    appliesTo: values['appliesTo'],
    productId: values['appliesTo'] === 'product' ? values['productId'] || null : null,
    priceListId: values['appliesTo'] === 'price_list' ? values['priceListId'] || null : null,
    marketplaceId: values['appliesTo'] === 'marketplace' ? values['marketplaceId'] || null : null,
    startDate: values['startDate'] ? String(values['startDate']) : null,
    endDate: values['endDate'] ? String(values['endDate']) : null,
    priority: Number(values['priority'] ?? 100),
    status: values['status'] ? 'active' : 'inactive',
    description: values['description'] || null
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  // --- internals -----------------------------------------------------------

  /**
   * Translates an enum code (`type`, `appliesTo`).
   *
   * The code is the stable API value. An unknown code falls back to the raw
   * value so a new backend enum stays visible instead of rendering a raw key.
   */
  private codeLabel(namespace: string, code: unknown): DisplayText {
    const value = typeof code === 'string' ? code : '';
    if (value === '') return { text: '' };

    const key = `${namespace}.${value}`;
    return this.text.has(key) ? { key } : { text: value };
  }
}
