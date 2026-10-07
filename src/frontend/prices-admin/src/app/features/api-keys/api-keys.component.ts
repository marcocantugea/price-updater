import { Component, inject, viewChild } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ApiKeyService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { staticOptions } from '../../core/utils/options';
import { toDateInputValue } from '../../core/utils/format';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import type { ColumnConfig, FieldConfig, RowAction } from '../../shared/crud-page.types';

/** Read-only integration keys for the external API (phase 1). */
@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'apiKeys.title' }"
      [subtitle]="{ key: 'apiKeys.subtitle' }"
      [entityLabel]="{ key: 'apiKeys.entity' }"
      [searchPlaceholder]="{ key: 'apiKeys.searchPlaceholder' }"
      [emptyMessage]="{ key: 'apiKeys.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [rowActions]="rowActions"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('api-keys:create')"
      [canEdit]="can('api-keys:update')"
      [canDelete]="can('api-keys:delete')"
      [statusFilter]="false"
    />
  `
})
export class ApiKeysComponent {
  readonly service = inject(ApiKeyService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly text = inject(DisplayTextService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly crudPage = viewChild(CrudPageComponent);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'prefix', label: { key: 'apiKeys.columns.prefix' } },
    { key: 'scopes', label: { key: 'apiKeys.columns.scopes' } },
    { key: 'effectiveStatus', label: { key: 'common.status' }, type: 'status' },
    { key: 'expiresAt', label: { key: 'apiKeys.columns.expiresAt' }, type: 'date' },
    { key: 'lastUsedAt', label: { key: 'apiKeys.columns.lastUsedAt' }, type: 'date' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'apiKeys.fields.namePlaceholder' }
    },
    {
      key: 'scope',
      label: { key: 'apiKeys.fields.scope' },
      type: 'select',
      required: true,
      defaultValue: 'products:read',
      full: true,
      // The scope slug is the API contract and never changes; only the
      // description next to it is translated.
      options: staticOptions([
        ['products:read', { key: 'apiKeys.scopes.productsRead' }],
        ['prices:read', { key: 'apiKeys.scopes.pricesRead' }],
        ['price-lists:read', { key: 'apiKeys.scopes.priceListsRead' }],
        ['marketplaces:read', { key: 'apiKeys.scopes.marketplacesRead' }]
      ])
    },
    {
      key: 'expiresAt',
      label: { key: 'apiKeys.fields.expiresAt' },
      type: 'date',
      help: { key: 'apiKeys.fields.expiresAtHelp' }
    }
  ];

  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    name: row['name'] ?? '',
    scope: Array.isArray(row['scopes']) ? (row['scopes'][0] ?? 'products:read') : 'products:read',
    expiresAt: toDateInputValue(row['expiresAt'])
  });

  readonly mapToPayload = (values: Record<string, unknown>): Record<string, unknown> => ({
    name: values['name'],
    scopes: [String(values['scope'])],
    expiresAt: values['expiresAt'] ? new Date(String(values['expiresAt'])).toISOString() : null
  });

  /** Revoking persists `revoked_at`; `expired` stays derived from `expires_at`. */
  readonly rowActions: RowAction[] = [
    {
      label: { key: 'apiKeys.rowActions.revoke' },
      tone: 'danger',
      visible: (row) => row.effectiveStatus !== 'revoked',
      run: (row) => this.revoke(row)
    }
  ];

  private revoke(row: Record<string, any>): void {
    this.service.revoke(String(row['id'])).subscribe({
      next: () => {
        this.toast.success(this.text.translate('apiKeys.toasts.revoked'));
        this.crudPage()?.refresh();
      },
      error: (error: unknown) => this.toast.error(this.errorLocalizer.message(error))
    });
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
