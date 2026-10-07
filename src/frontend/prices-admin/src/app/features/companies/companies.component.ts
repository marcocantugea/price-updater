import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { CurrencyService } from '../../core/services/catalog.services';
import { TenantService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, recordStatusOptions, timeZoneOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

/** Companies (tenants). Visible and manageable only by the global admin. */
@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'companies.title' }"
      [subtitle]="{ key: 'companies.subtitle' }"
      [entityLabel]="{ key: 'companies.entity' }"
      [searchPlaceholder]="{ key: 'companies.searchPlaceholder' }"
      [emptyMessage]="{ key: 'companies.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('tenants:create')"
      [canEdit]="can('tenants:update')"
      [canDelete]="can('tenants:delete')"
    />
  `
})
export class CompaniesComponent {
  readonly service = inject(TenantService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'commercialName', label: { key: 'companies.columns.commercialName' }, sortable: true },
    { key: 'legalName', label: { key: 'companies.columns.legalName' } },
    { key: 'slug', label: { key: 'common.slug' } },
    { key: 'defaultCurrency', label: { key: 'common.currency' } },
    { key: 'timeZone', label: { key: 'companies.fields.timeZone' } },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'commercialName', label: { key: 'companies.columns.commercialName' }, type: 'text', required: true },
    { key: 'legalName', label: { key: 'companies.columns.legalName' }, type: 'text', required: true },
    {
      key: 'slug',
      label: { key: 'common.slug' },
      type: 'text',
      required: true,
      placeholder: { key: 'companies.fields.slugPlaceholder' },
      help: { key: 'companies.fields.slugHelp' }
    },
    {
      key: 'defaultCurrency',
      label: { key: 'companies.fields.defaultCurrency' },
      type: 'select',
      required: true,
      optionsKey: 'currencies'
    },
    {
      key: 'timeZone',
      label: { key: 'companies.fields.timeZone' },
      type: 'select',
      required: true,
      options: timeZoneOptions(),
      defaultValue: 'UTC'
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
    currencies: currencyOptionLoader(this.currencyService)
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
