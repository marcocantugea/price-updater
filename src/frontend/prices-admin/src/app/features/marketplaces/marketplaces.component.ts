import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { MarketplaceService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { marketplaceCodeOptions, recordStatusOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

@Component({
  selector: 'app-marketplaces',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'marketplaces.title' }"
      [subtitle]="{ key: 'marketplaces.subtitle' }"
      [entityLabel]="{ key: 'marketplaces.entity' }"
      [searchPlaceholder]="{ key: 'marketplaces.searchPlaceholder' }"
      [emptyMessage]="{ key: 'marketplaces.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [canCreate]="can('marketplaces:create')"
      [canEdit]="can('marketplaces:update')"
      [canDelete]="can('marketplaces:delete')"
    />
  `
})
export class MarketplacesComponent {
  readonly service = inject(MarketplaceService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'code', label: { key: 'common.code' } },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'marketplaces.fields.namePlaceholder' }
    },
    {
      key: 'code',
      label: { key: 'common.code' },
      type: 'select',
      required: true,
      options: marketplaceCodeOptions()
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

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
