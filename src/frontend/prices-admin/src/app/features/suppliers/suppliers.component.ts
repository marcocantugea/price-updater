import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { SupplierService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { recordStatusOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

/**
 * Tenant supplier catalog (TEC-42).
 *
 * A thin wrapper over the shared CRUD screen: the page owns only its columns,
 * its form fields and its permission flags. It is reached from the Suppliers
 * section in Settings, and `tenantGuard` keeps it bound to the selected company.
 *
 * The 150-character name limit is declared here as well as in the API, so the
 * user sees the boundary while typing; the API remains the final authority.
 */
@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'suppliers.title' }"
      [subtitle]="{ key: 'suppliers.subtitle' }"
      [entityLabel]="{ key: 'suppliers.entity' }"
      [searchPlaceholder]="{ key: 'suppliers.searchPlaceholder' }"
      [emptyMessage]="{ key: 'suppliers.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [canCreate]="can('suppliers:create')"
      [canEdit]="can('suppliers:update')"
      [canDelete]="can('suppliers:delete')"
    />
  `
})
export class SuppliersComponent {
  readonly service = inject(SupplierService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      maxLength: 150,
      placeholder: { key: 'suppliers.fields.namePlaceholder' },
      help: { key: 'suppliers.fields.nameHelp' }
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

  /**
   * A `tenant_user` holds read/create/update but no delete, so the row action is
   * simply absent for that role. `tenant_admin` keeps all four.
   */
  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
