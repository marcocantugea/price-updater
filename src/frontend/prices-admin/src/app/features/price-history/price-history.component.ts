import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { PriceHistoryService } from '../../core/services/catalog.services';
import type { ColumnConfig } from '../../shared/crud-page.types';

/** Append-only audit trail: read-only in phase 1. */
@Component({
  selector: 'app-price-history',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'priceHistory.title' }"
      [subtitle]="{ key: 'priceHistory.subtitle' }"
      [entityLabel]="{ key: 'priceHistory.entity' }"
      [searchPlaceholder]="{ key: 'priceHistory.searchPlaceholder' }"
      [emptyMessage]="{ key: 'priceHistory.emptyMessage' }"
      [columns]="columns"
      [fields]="[]"
      [service]="service"
      [statusFilter]="false"
      [canCreate]="false"
      [canEdit]="false"
      [canDelete]="false"
      [pageSize]="20"
    />
  `
})
export class PriceHistoryComponent {
  readonly service = inject(PriceHistoryService);

  readonly columns: ColumnConfig[] = [
    { key: 'createdAt', label: { key: 'priceHistory.columns.date' }, type: 'date' },
    { key: 'product.name', label: { key: 'common.product' } },
    { key: 'oldBasePrice', label: { key: 'priceHistory.columns.oldBase' }, type: 'money', align: 'right' },
    { key: 'newBasePrice', label: { key: 'priceHistory.columns.newBase' }, type: 'money', align: 'right' },
    { key: 'oldFinalPrice', label: { key: 'priceHistory.columns.oldFinal' }, type: 'money', align: 'right' },
    { key: 'newFinalPrice', label: { key: 'priceHistory.columns.newFinal' }, type: 'money', align: 'right' },
    { key: 'changedByType', label: { key: 'priceHistory.columns.actor' } },
    { key: 'reason', label: { key: 'priceHistory.columns.reason' } }
  ];
}
