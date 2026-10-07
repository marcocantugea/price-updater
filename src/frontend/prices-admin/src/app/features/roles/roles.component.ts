import { Component, inject, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ModalComponent } from '../../shared/modal.component';
import { RoleService } from '../../core/services/access.services';
import { PermissionService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { recordStatusOptions } from '../../core/utils/options';
import { humanize } from '../../core/utils/format';
import { DisplayTextService } from '../../core/i18n/display-text.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import type { ColumnConfig, DisplayText, FieldConfig, RowAction } from '../../shared/crud-page.types';
import type { Permission, Role } from '../../core/models';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [TranslocoPipe, CrudPageComponent, ModalComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'roles.title' }"
      [subtitle]="{ key: 'roles.subtitle' }"
      [entityLabel]="{ key: 'roles.entity' }"
      [searchPlaceholder]="{ key: 'roles.searchPlaceholder' }"
      [emptyMessage]="{ key: 'roles.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [rowActions]="rowActions"
      [canCreate]="can('roles:create')"
      [canEdit]="can('roles:update')"
      [canDelete]="can('roles:delete')"
    />

    <app-modal
      [open]="permissionsOpen()"
      [title]="'roles.permissions.title' | transloco"
      [subtitle]="selectedRoleName()"
      (closed)="closePermissions()"
    >
      @if (loadingPermissions()) {
        <p class="text-sm text-olive">{{ 'roles.permissions.loading' | transloco }}</p>
      } @else {
        <div class="max-h-96 overflow-y-auto space-y-1.5" data-testid="permissions-list">
          @for (permission of allPermissions(); track permission.slug) {
            <label class="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-sidebar/60 cursor-pointer">
              <input
                type="checkbox"
                class="mt-0.5 rounded border-line text-forest focus:ring-forest"
                [checked]="isSelected(permission.slug)"
                (change)="togglePermission(permission.slug)"
              />
              <span>
                <!-- The slug stays as-is: it is the stable API identifier. -->
                <span class="block text-sm font-medium text-forest">{{ permission.slug }}</span>
                <span class="block text-xs text-olive">{{ permissionDescription(permission) }}</span>
              </span>
            </label>
          }
        </div>

        <div class="pt-4 mt-4 flex items-center justify-between gap-3 border-t border-line">
          <p class="text-xs text-olive">
            {{ 'roles.permissions.selected' | transloco: { count: selectedSlugs().length } }}
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              class="px-4 py-2.5 bg-header text-forest border border-line rounded-md text-sm font-medium hover:bg-active transition-colors"
              (click)="closePermissions()"
            >
              {{ 'common.cancel' | transloco }}
            </button>
            <button
              type="button"
              class="px-5 py-2.5 bg-forest text-white rounded-md text-sm font-medium hover:bg-forest/90 transition-colors disabled:opacity-60"
              [disabled]="savingPermissions()"
              (click)="savePermissions()"
              data-testid="save-permissions"
            >
              {{ savingPermissions() ? ('common.saving' | transloco) : ('roles.permissions.save' | transloco) }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class RolesComponent {
  readonly service = inject(RoleService);
  private readonly permissionService = inject(PermissionService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly text = inject(DisplayTextService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);
  private readonly crudPage = viewChild(CrudPageComponent);

  readonly permissionsOpen = signal(false);
  readonly loadingPermissions = signal(false);
  readonly savingPermissions = signal(false);
  readonly selectedRole = signal<Role | null>(null);
  readonly allPermissions = signal<Permission[]>([]);
  readonly selectedSlugs = signal<string[]>([]);

  readonly columns: ColumnConfig[] = [
    // System roles are seeded with English copy, so the name is resolved by slug
    // and custom roles fall back to their database value.
    { key: 'name', label: { key: 'common.name' }, sortable: true, value: (row) => this.roleName(row) },
    { key: 'slug', label: { key: 'common.slug' } },
    { key: 'isSystem', label: { key: 'roles.columns.isSystem' }, type: 'boolean' },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: { key: 'common.name' }, type: 'text', required: true },
    {
      key: 'slug',
      label: { key: 'common.slug' },
      type: 'text',
      required: true,
      placeholder: { key: 'roles.fields.slugPlaceholder' }
    },
    { key: 'description', label: { key: 'common.description' }, type: 'textarea', full: true },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    }
  ];

  readonly rowActions: RowAction[] = [
    {
      label: { key: 'roles.rowActions.permissions' },
      visible: () => this.can('roles:assign-permissions'),
      run: (row) => this.openPermissions(row as Role)
    }
  ];

  humanize = humanize;

  /** Resolved name of the role shown in the permissions modal header. */
  readonly selectedRoleName = (): string => {
    const role = this.selectedRole();
    return role ? this.text.resolve(this.roleName(role)) : '';
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  isSelected(slug: string): boolean {
    return this.selectedSlugs().includes(slug);
  }

  togglePermission(slug: string): void {
    this.selectedSlugs.update((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  }

  /**
   * Localized description of a permission, resolved by slug.
   *
   * The API seeds permissions with English names and descriptions; a permission
   * the catalog does not know yet keeps its API copy so it stays visible.
   */
  permissionDescription(permission: Permission): string {
    const key = `permissions.${permission.slug}.description`;
    if (this.text.has(key)) return this.text.translate(key);
    return permission.description || humanize(permission.slug);
  }

  openPermissions(role: Role): void {
    this.selectedRole.set(role);
    this.permissionsOpen.set(true);
    this.loadingPermissions.set(true);

    this.permissionService.list({ limit: 200 }).subscribe({
      next: (response) => {
        this.allPermissions.set(response.data);
        this.service.permissions(role.id).subscribe({
          next: (result) => {
            this.selectedSlugs.set(result.permissionSlugs);
            this.loadingPermissions.set(false);
          },
          error: () => {
            this.selectedSlugs.set([]);
            this.loadingPermissions.set(false);
          }
        });
      },
      error: (error: unknown) => {
        this.loadingPermissions.set(false);
        this.toast.error(this.errorLocalizer.message(error));
      }
    });
  }

  closePermissions(): void {
    this.permissionsOpen.set(false);
    this.selectedRole.set(null);
  }

  savePermissions(): void {
    const role = this.selectedRole();
    if (!role) return;

    this.savingPermissions.set(true);
    this.service.assignPermissions(role.id, this.selectedSlugs()).subscribe({
      next: () => {
        this.savingPermissions.set(false);
        this.toast.success(this.text.translate('roles.toasts.permissionsUpdated'));
        this.closePermissions();
        this.crudPage()?.refresh();
      },
      error: (error: unknown) => {
        this.savingPermissions.set(false);
        this.toast.error(this.errorLocalizer.message(error));
      }
    });
  }

  // --- internals -----------------------------------------------------------

  private roleName(row: RoleLike): DisplayText {
    const slug = row?.slug ?? '';
    const key = `roles.systemRoles.${slug}.name`;

    if (row?.isSystem === true && this.text.has(key)) return { key };
    return { text: String(row?.name ?? '') };
  }
}

interface RoleLike {
  slug?: string;
  name?: string;
  isSystem?: boolean;
}
