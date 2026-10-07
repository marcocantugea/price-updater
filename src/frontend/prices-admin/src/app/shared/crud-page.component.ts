import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ModalComponent } from './modal.component';
import { StatePanelComponent } from './state-panel.component';
import { StatusBadgeComponent } from './status-badge.component';
import { SwitchComponent } from './ui/switch.component';
import { AsyncAutocompleteComponent } from './ui/async-autocomplete.component';
import { DisplayTextPipe } from './display-text.pipe';
import { MoneyPipe } from '../core/pipes/money.pipe';
import { AppDatePipe } from '../core/pipes/app-date.pipe';
import { ToastService } from '../core/services/toast.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { DisplayTextService } from '../core/i18n/display-text.service';
import { ApiErrorLocalizerService } from '../core/i18n/api-error-localizer.service';
import { readPath } from '../core/utils/format';
import { integerValidator } from '../core/utils/validation';
import { EMPTY_TEXT } from './crud-page.types';
import type { CrudResource } from '../core/services/crud-resource';
import type { PageMeta } from '../core/models';
import type {
  AsyncOptionLoader,
  ColumnConfig,
  CrossValidator,
  CrudMessages,
  DisplayText,
  FieldConfig,
  FieldOption,
  OptionLoader,
  PayloadMapper,
  PreviewResult,
  PreviewRunner,
  RowAction
} from './crud-page.types';

/**
 * Status filter chips. Labels are catalog keys resolved while rendering, so the
 * filter follows a runtime language switch.
 */
const STATUS_CHIPS: FieldOption[] = [
  { value: '', label: { key: 'common.all' } },
  { value: 'active', label: { key: 'common.activeOnly' } },
  { value: 'inactive', label: { key: 'common.inactiveOnly' } }
];

/**
 * Reusable administrative table + form screen.
 *
 * Every module composes this component with its own columns/fields and service,
 * which keeps the look, the loading/empty/error states and the CRUD behaviour
 * identical across the application.
 *
 * All chrome copy lives in the `common.*` / `crud.*` catalogs. Messages that
 * mention the entity are complete sentences with an `{{entity}}` parameter —
 * never concatenated fragments — and a page can replace any of them wholesale
 * through the `messages` input.
 */
@Component({
  selector: 'app-crud-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    ModalComponent,
    StatePanelComponent,
    StatusBadgeComponent,
    SwitchComponent,
    AsyncAutocompleteComponent,
    DisplayTextPipe,
    MoneyPipe,
    AppDatePipe
  ],
  templateUrl: './crud-page.component.html'
})
export class CrudPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly text = inject(DisplayTextService);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);

  // --- configuration -------------------------------------------------------
  readonly title = input<DisplayText>(EMPTY_TEXT);
  readonly subtitle = input<DisplayText>(EMPTY_TEXT);
  /** Singular noun for the entity, interpolated into the default messages. */
  readonly entityLabel = input<DisplayText>({ key: 'common.record' });
  /** Whole-sentence overrides for the chrome; see `CrudMessages`. */
  readonly messages = input<CrudMessages>({});
  readonly columns = input<ColumnConfig[]>([]);
  readonly fields = input<FieldConfig[]>([]);
  readonly service = input.required<CrudResource<any>>();
  readonly canCreate = input<boolean>(false);
  readonly canEdit = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  readonly statusFilter = input<boolean>(true);
  readonly searchPlaceholder = input<DisplayText>({ key: 'common.search' });
  readonly emptyMessage = input<DisplayText>(EMPTY_TEXT);
  readonly selectSources = input<Record<string, OptionLoader>>({});
  /**
   * Query-aware sources for `autocomplete` fields, keyed by
   * `FieldConfig.asyncOptionsKey`. Kept apart from `selectSources` so the eager
   * loaders keep their current behaviour.
   */
  readonly asyncSelectSources = input<Record<string, AsyncOptionLoader>>({});
  readonly crossValidators = input<CrossValidator[]>([]);
  readonly previewRunner = input<PreviewRunner | null>(null);
  readonly previewLabel = input<DisplayText>({ key: 'crud.preview' });
  readonly mapToForm = input<((row: any) => Record<string, unknown>) | null>(null);
  readonly mapToPayload = input<PayloadMapper | null>(null);
  readonly pageSize = input<number>(10);
  /** Optional per-row actions (revoke key, manage permissions, ...). */
  readonly rowActions = input<RowAction[]>([]);

  /** Emitted after a successful mutation so hosts can refresh related data. */
  readonly changed = output<void>();

  // --- list state ----------------------------------------------------------
  readonly items = signal<any[]>([]);
  readonly meta = signal<PageMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly status = signal('');
  readonly page = signal(1);
  readonly sort = signal('');
  readonly order = signal<'asc' | 'desc'>('desc');
  readonly statusChips = STATUS_CHIPS;

  // --- form state ----------------------------------------------------------
  readonly modalOpen = signal(false);
  readonly editing = signal<any | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly options = signal<Record<string, FieldOption[]>>({});
  /**
   * Per-field label of the current selection, resolved from the edited row.
   * Only used for rendering an `autocomplete` field; the control keeps the id.
   */
  readonly initialOptions = signal<Record<string, FieldOption | null>>({});
  readonly previewResults = signal<PreviewResult[]>([]);
  readonly previewing = signal(false);
  readonly deleteTarget = signal<any | null>(null);
  readonly deleting = signal(false);

  form: FormGroup = this.fb.group({});
  readonly searchInput = new FormControl('');

  readonly isEditing = computed(() => this.editing() !== null);

  /** Resolved singular entity name used as the `{{entity}}` parameter. */
  readonly entity = computed(() => this.text.resolve(this.entityLabel()));

  readonly createLabel = computed(() => this.message(this.messages().create, 'crud.create'));

  readonly editLabel = computed(() => this.message(this.messages().edit, 'crud.edit'));

  readonly modalTitle = computed(() => (this.isEditing() ? this.editLabel() : this.createLabel()));

  readonly loadingMessage = computed(() => this.message(this.messages().loading, 'crud.loading'));

  readonly emptyTitle = computed(() => this.message(this.messages().emptyTitle, 'crud.emptyTitle'));

  /**
   * Body copy of the empty state. The existing `emptyMessage` input wins, so a
   * page keeps its specific invitation ("Invita a tu equipo...") and everything
   * else inherits the generic sentence.
   */
  readonly emptyHint = computed(() => {
    const override = this.text.resolve(this.emptyMessage());
    return override.trim() !== '' ? override : this.text.translate('crud.emptyHint');
  });

  readonly invalidFormMessage = computed(() =>
    this.message(this.messages().invalidForm, 'common.reviewFields')
  );

  readonly deleteTitle = computed(() => this.message(this.messages().deleteTitle, 'crud.deleteTitle'));

  readonly deleteSubtitle = computed(() => this.text.translate('crud.deleteSubtitle'));

  readonly deleteMessage = computed(() =>
    this.message(this.messages().deleteMessage, 'crud.deleteMessage')
  );

  readonly formSubtitle = computed(() => this.text.translate('crud.formSubtitle'));

  /** Controls currently visible, honouring `visibleWhen`, create/edit flags. */
  readonly visibleFields = computed(() =>
    this.fields().filter((field) => {
      if (field.createOnly && this.isEditing()) return false;
      if (field.editOnly && !this.isEditing()) return false;
      return true;
    })
  );

  constructor() {
    this.searchInput.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.search.set(value ?? '');
        this.page.set(1);
        void this.load();
      });
  }

  ngOnInit(): void {
    void this.loadOptions();
    void this.load();

    // Reloads the listing when a global administrator switches company.
    this.tenantContext.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        // The form and the option caches belong to the previous company: an open
        // modal would keep showing its references, and a stale product could
        // still be selected.
        this.closeModal();
        this.options.set({});
        void this.loadOptions();
        void this.load();
      });
  }

  // --- data loading --------------------------------------------------------

  private buildQuery(): Record<string, unknown> {
    const query: Record<string, unknown> = { page: this.page(), limit: this.pageSize() };
    if (this.search()) query['search'] = this.search();
    if (this.status()) query['status'] = this.status();
    if (this.sort()) {
      query['sort'] = this.sort();
      query['order'] = this.order();
    }
    return query;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    this.service()
      .list(this.buildQuery())
      .subscribe({
        next: (response: any) => {
          this.items.set(response?.data ?? []);
          this.meta.set(response?.meta ?? { page: 1, limit: this.pageSize(), total: 0, totalPages: 0 });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(this.errorLocalizer.message(error));
          this.items.set([]);
          this.loading.set(false);
        }
      });
  }

  /** Loads dynamic select options once per configured source. */
  async loadOptions(): Promise<void> {
    const sources = this.selectSources();
    for (const [key, loader] of Object.entries(sources)) {
      loader().subscribe({
        next: (options) => this.options.update((current) => ({ ...current, [key]: options })),
        error: () => this.options.update((current) => ({ ...current, [key]: [] }))
      });
    }
  }

  optionsFor(field: FieldConfig): FieldOption[] {
    if (field.options) return field.options;
    if (field.optionsKey) return this.options()[field.optionsKey] ?? [];
    return [];
  }

  /** Resolves the configured query-aware source for an autocomplete field. */
  asyncSourceFor(field: FieldConfig): AsyncOptionLoader | null {
    if (!field.asyncOptionsKey) return null;
    return this.asyncSelectSources()[field.asyncOptionsKey] ?? null;
  }

  /** Renders an immutable reference as read-only while editing. */
  isDisabledOnEdit(field: FieldConfig): boolean {
    return this.isControlDisabled(field);
  }

  /** Single source of truth for the `disabledOnEdit` rule. */
  private isControlDisabled(field: FieldConfig): boolean {
    return field.disabledOnEdit === true && this.isEditing();
  }

  /**
   * Marks the control as touched/dirty when a value changes through a control
   * that does not do it itself, so the shared required treatment appears.
   */
  onAutocompleteSelected(field: FieldConfig): void {
    const control = this.form.get(field.key);
    control?.markAsDirty();
    control?.markAsTouched();
  }

  /** Resolves the per-row label of the value an autocomplete field already has. */
  initialOptionFor(field: FieldConfig): FieldOption | null {
    return this.initialOptions()[field.key] ?? null;
  }

  private resolveInitialOptions(row: any): Record<string, FieldOption | null> {
    const resolved: Record<string, FieldOption | null> = {};

    for (const field of this.fields()) {
      if (!field.initialOption) continue;
      try {
        resolved[field.key] = field.initialOption(row) ?? null;
      } catch {
        // A broken label resolver must not break opening the modal: the field
        // then falls back to showing the raw id.
        resolved[field.key] = null;
      }
    }

    return resolved;
  }

  // --- toolbar -------------------------------------------------------------

  refresh(): void {
    void this.load();
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
    void this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || (this.meta().totalPages > 0 && page > this.meta().totalPages)) return;
    this.page.set(page);
    void this.load();
  }

  toggleSort(column: ColumnConfig): void {
    if (!column.sortable) return;
    if (this.sort() === column.key) {
      this.order.set(this.order() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(column.key);
      this.order.set('asc');
    }
    void this.load();
  }

  // --- table rendering -----------------------------------------------------

  cell(row: any, column: ColumnConfig): unknown {
    return readPath(row, column.key);
  }

  /**
   * Text for the default (text) cell branch.
   *
   * A column may override the raw value — used to translate system catalog rows
   * by slug while leaving user-created rows untouched. The override wins even
   * when it resolves to an empty string, so a column can deliberately render
   * blank instead of leaking the raw database copy.
   */
  cellText(row: any, column: ColumnConfig): string {
    if (column.value) return this.text.resolve(column.value(row));
    return this.asText(this.cell(row, column));
  }

  asText(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  asStatus(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  currencyOf(row: any, column: ColumnConfig): string {
    if (!column.currencyKey) return 'MXN';
    const code = readPath(row, column.currencyKey);
    return typeof code === 'string' && code !== '' ? code : 'MXN';
  }

  isVisible(field: FieldConfig): boolean {
    if (!field.visibleWhen) return true;
    return this.form.get(field.visibleWhen.key)?.value === field.visibleWhen.equals;
  }

  // --- create / edit -------------------------------------------------------

  private buildForm(values: Record<string, unknown>): FormGroup {
    const controls: Record<string, FormControl> = {};

    for (const field of this.fields()) {
      const validators = [];
      if (field.required) validators.push(Validators.required);
      if (field.maxLength !== undefined) validators.push(Validators.maxLength(field.maxLength));
      if (field.type === 'number') {
        validators.push(Validators.min(field.min ?? 0));
        if (field.max !== undefined) validators.push(Validators.max(field.max));
      }
      if (field.integer) validators.push(integerValidator);

      const initial = values[field.key] ?? field.defaultValue ?? (field.type === 'checkbox' ? false : '');
      const control = new FormControl(initial, { validators, nonNullable: false });

      // A disabled control still participates in the form and in `getRawValue`,
      // so an immutable reference keeps its value for the preview while being
      // impossible to change through the UI.
      if (this.isControlDisabled(field)) control.disable();

      controls[field.key] = control;
    }

    const group = this.fb.group(controls);

    for (const validator of this.crossValidators()) {
      group.addValidators(validator);
    }
    group.updateValueAndValidity();

    return group;
  }

  openCreate(): void {
    this.editing.set(null);
    this.form = this.buildForm({});
    this.formError.set(null);
    this.fieldErrors.set({});
    this.previewResults.set([]);
    this.initialOptions.set({});
    this.modalOpen.set(true);
  }

  openEdit(row: any): void {
    this.editing.set(row);
    const mapper = this.mapToForm();
    this.form = this.buildForm(mapper ? mapper(row) : row);
    this.formError.set(null);
    this.fieldErrors.set({});
    this.previewResults.set([]);
    this.initialOptions.set(this.resolveInitialOptions(row));
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.previewResults.set([]);
    this.initialOptions.set({});
  }

  /** Runs the optional preview (used by the price form to show the final price). */
  runPreview(): void {
    const runner = this.previewRunner();
    if (!runner) return;

    this.previewing.set(true);
    runner(this.form.getRawValue() as Record<string, unknown>).subscribe({
      next: (results) => {
        this.previewResults.set(results);
        this.previewing.set(false);
      },
      error: (error: unknown) => {
        this.formError.set(this.errorLocalizer.message(error));
        this.previewResults.set([]);
        this.previewing.set(false);
      }
    });
  }

  submit(): void {
    this.formError.set(null);

    if (this.form.invalid || this.form.errors) {
      this.form.markAllAsTouched();
      const zodErrors = (this.form.errors?.['zod'] ?? {}) as Record<string, string>;
      this.fieldErrors.set(zodErrors);
      if (Object.keys(zodErrors).length > 0) {
        this.formError.set(this.invalidFormMessage());
      }
      return;
    }

    const mapper = this.mapToPayload();
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const editing = this.editing();
    const payload = mapper ? mapper(raw, { isEditing: editing !== null }) : raw;

    this.saving.set(true);
    const request = editing
      ? this.service().update(editing.id, payload)
      : this.service().create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(
          editing
            ? this.message(this.messages().updated, 'crud.updated')
            : this.message(this.messages().created, 'crud.created')
        );
        this.closeModal();
        this.changed.emit();
        void this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(this.errorLocalizer.message(error));
        this.fieldErrors.set(this.errorLocalizer.fieldErrors(error));
      }
    });
  }

  // --- delete --------------------------------------------------------------

  askDelete(row: any): void {
    this.deleteTarget.set(row);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;

    this.deleting.set(true);
    this.service()
      .remove(target.id)
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.toast.success(this.message(this.messages().deleted, 'crud.deleted'));
          this.deleteTarget.set(null);
          this.changed.emit();
          void this.load();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.toast.error(this.errorLocalizer.message(error));
          this.deleteTarget.set(null);
        }
      });
  }

  /**
   * Resolves a field error for display.
   *
   * Cross-field (Zod) validators store a **catalog key** as the issue message so
   * the copy follows a runtime language switch; server errors arrive already
   * localized by `ApiErrorLocalizerService`. Values that are not known keys are
   * rendered verbatim, so an unmapped API message is never swallowed.
   */
  fieldError(key: string): string | null {
    const value = this.fieldErrors()[key];
    if (value === undefined) return null;

    return this.text.has(value) ? this.text.translate(value) : value;
  }

  isInvalid(field: FieldConfig): boolean {
    const control = this.form.get(field.key);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  visibleRowActions(row: any): RowAction[] {
    return this.rowActions().filter((action) => (action.visible ? action.visible(row) : true));
  }

  // --- internals -----------------------------------------------------------

  /**
   * Resolves a chrome message: a page-supplied override wins, otherwise the
   * catalog default is translated with the entity interpolated.
   */
  private message(override: DisplayText | undefined, fallbackKey: string): string {
    const entity = this.entity();

    if (override !== undefined) {
      const resolved = this.text.resolve(override, { entity });
      if (resolved.trim() !== '') return resolved;
    }

    return this.text.translate(fallbackKey, { entity });
  }
}
