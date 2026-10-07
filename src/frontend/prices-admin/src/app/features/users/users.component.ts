import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { RoleService, UserService } from '../../core/services/access.services';
import { PriceListService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { idOptionLoader, recordStatusOptions } from '../../core/utils/options';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALE_IDS,
  localeMetadata
} from '../../core/i18n/supported-locales';
import type { ColumnConfig, FieldConfig, FieldOption, PayloadMapper, RowAction } from '../../shared/crud-page.types';
import type { PriceList, User } from '../../core/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, CrudPageComponent, ModalComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'users.title' }"
      [subtitle]="{ key: 'users.subtitle' }"
      [entityLabel]="{ key: 'users.entity' }"
      [searchPlaceholder]="{ key: 'users.searchPlaceholder' }"
      [emptyMessage]="{ key: 'users.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('users:create')"
      [canEdit]="can('users:update')"
      [canDelete]="can('users:delete')"
      [rowActions]="rowActions"
    />
    <app-modal
      [open]="accessOpen()"
      [title]="'users.access.title' | transloco"
      [subtitle]="'users.access.subtitle' | transloco"
      (closed)="closeAccess()"
    >
      @if (accessOpen()) {
        <div class="space-y-4">
          <p class="text-sm text-olive">
            {{ 'users.access.user' | transloco }}:
            <span class="font-medium text-forest">{{ selectedUser()?.name }}</span>
          </p>
          <div class="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line p-3">
            @for (list of availablePriceLists(); track list.id) {
              <label class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-forest hover:bg-sidebar">
                <input type="checkbox" [checked]="selectedAccessIds().has(list.id)" (change)="toggleAccess(list.id)" />
                <span>{{ list.name }}</span>
              </label>
            } @empty { <p class="text-sm text-olive">{{ 'users.access.empty' | transloco }}</p> }
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-md border border-line px-4 py-2 text-sm text-forest" (click)="closeAccess()">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="button" class="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" [disabled]="accessSaving()" (click)="saveAccess()">
              {{ accessSaving() ? ('common.saving' | transloco) : ('users.access.save' | transloco) }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class UsersComponent {
  readonly service = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly priceListService = inject(PriceListService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly text = inject(DisplayTextService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'email', label: { key: 'users.columns.email' } },
    { key: 'role.name', label: { key: 'users.columns.role' } },
    { key: 'lastLoginAt', label: { key: 'users.columns.lastLogin' }, type: 'date' },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  /**
   * Language options for the administrative selector.
   *
   * Labels are catalog keys resolved while rendering, so the list follows a
   * runtime language switch instead of freezing the language that was active
   * when this component was constructed.
   */
  readonly preferredLocaleOptions: FieldOption[] = SUPPORTED_LOCALE_IDS.map((locale) => ({
    value: locale,
    label: { key: localeMetadata(locale).fullLabelKey }
  }));

  readonly fields: FieldConfig[] = [
    { key: 'name', label: { key: 'common.name' }, type: 'text', required: true },
    {
      key: 'email',
      label: { key: 'users.fields.email' },
      type: 'text',
      required: true,
      placeholder: { key: 'users.fields.emailPlaceholder' }
    },
    {
      key: 'password',
      label: { key: 'users.fields.password' },
      type: 'password',
      required: true,
      createOnly: true,
      help: { key: 'users.fields.passwordHelp' }
    },
    {
      key: 'password',
      label: { key: 'users.fields.newPassword' },
      type: 'password',
      editOnly: true,
      help: { key: 'users.fields.newPasswordHelp' }
    },
    { key: 'roleId', label: { key: 'users.columns.role' }, type: 'select', required: true, optionsKey: 'roles' },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    },
    {
      // Per-user UI language. It belongs to the user, never to the tenant, so it
      // lives here and not in the tenant-scoped Settings screen.
      key: 'preferredLocale',
      label: { key: 'users.preferredLocale.label' },
      type: 'select',
      required: true,
      defaultValue: DEFAULT_LOCALE,
      help: { key: 'users.preferredLocale.help' },
      options: this.preferredLocaleOptions
    }
  ];

  readonly selectSources = {
    roles: idOptionLoader(this.roleService, 'name')
  };

  readonly accessOpen = signal(false);
  readonly accessSaving = signal(false);
  readonly selectedUser = signal<User | null>(null);
  readonly availablePriceLists = signal<PriceList[]>([]);
  readonly selectedAccessIds = signal<Set<string>>(new Set());

  readonly rowActions: RowAction[] = [
    {
      label: { key: 'users.rowActions.priceLists' },
      visible: () => this.can('price-list-access:manage'),
      run: (row) => this.openAccess(row)
    }
  ];

  /**
   * An empty password means "keep the current one"; sending `''` would fail the
   * API's minimum-length rule (strict payload validation).
   */
  readonly mapToPayload: PayloadMapper = (values) => {
    const payload: Record<string, unknown> = { ...values };
    if (!payload['password']) delete payload['password'];
    return payload;
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  openAccess(user: User): void {
    this.selectedUser.set(user);
    this.accessOpen.set(true);
    this.selectedAccessIds.set(new Set());
    this.priceListService.list({ limit: 100, status: 'active', sort: 'name', order: 'asc' }).subscribe({
      next: (response) => this.availablePriceLists.set(response.data),
      error: () => this.availablePriceLists.set([])
    });
    this.service.priceListAccess(user.id).subscribe({
      next: (access) => this.selectedAccessIds.set(new Set(access.priceListIds)),
      error: (error) => this.toast.error(this.errorLocalizer.message(error, { fallbackKey: 'users.errors.loadAccess' }))
    });
  }

  toggleAccess(id: string): void {
    const next = new Set(this.selectedAccessIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedAccessIds.set(next);
  }

  saveAccess(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.accessSaving.set(true);
    this.service.assignPriceLists(user.id, [...this.selectedAccessIds()]).subscribe({
      next: () => {
        this.accessSaving.set(false);
        this.accessOpen.set(false);
        this.toast.success(this.text.translate('users.toasts.accessUpdated'));
      },
      error: (error) => {
        this.accessSaving.set(false);
        this.toast.error(this.errorLocalizer.message(error, { fallbackKey: 'users.errors.saveAccess' }));
      }
    });
  }

  closeAccess(): void {
    this.accessOpen.set(false);
    this.selectedUser.set(null);
    this.availablePriceLists.set([]);
  }
}
