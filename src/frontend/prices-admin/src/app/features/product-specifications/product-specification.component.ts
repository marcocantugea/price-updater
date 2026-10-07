import { Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { PresentationEditorComponent } from './presentation-editor.component';
import { SupplierPickerComponent } from './supplier-picker.component';
import { AsyncAutocompleteComponent } from '../../shared/ui/async-autocomplete.component';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { ProductSpecificationService } from '../../core/services/product-specification.service';
import { BrandService, UnitOfMeasureService } from '../../core/services/catalog.services';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';
import { SessionStore } from '../../core/services/session.store';
import type {
  IdentifierType,
  Measurement,
  Presentation,
  ProductSpecificationAggregate,
  ProductSpecificationPayload,
  SpecificationMeasurements,
  UnitDimension,
  UnitOfMeasure,
  UnitOption
} from '../../core/models';
import type { AsyncOptionLoader, FieldOption } from '../../shared/crud-page.types';

type Mode = 'view' | 'edit';

/**
 * Dedicated page for the product-specification aggregate.
 *
 * It is not built on `CrudPageComponent`: that component models a flat record
 * with scalar fields, and this aggregate is a nested collection (presentations,
 * each with identifiers) plus a many-to-many supplier set, edited by a single
 * full-replacement `PUT`. A modal over a flat field list cannot express it.
 *
 * The page reads with `products:read` and only offers editing with
 * `products:update`, so a read-only user gets a complete summary rather than a
 * disabled form.
 */
@Component({
  selector: 'app-product-specification',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    PresentationEditorComponent,
    SupplierPickerComponent,
    AsyncAutocompleteComponent,
    StatePanelComponent
  ],
  templateUrl: './product-specification.component.html'
})
export class ProductSpecificationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly specificationService = inject(ProductSpecificationService);
  private readonly unitService = inject(UnitOfMeasureService);
  private readonly brandService = inject(BrandService);
  private readonly session = inject(SessionStore);
  private readonly localizer = inject(ApiErrorLocalizerService);

  readonly productId = this.route.snapshot.paramMap.get('productId') ?? '';

  readonly mode = signal<Mode>('view');
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly aggregate = signal<ProductSpecificationAggregate | null>(null);
  readonly savedMessage = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly confirmingClear = signal(false);

  readonly units = signal<UnitOfMeasure[]>([]);

  readonly canEdit = computed(() => this.session.hasPermission('products:update'));

  /** Units offered per measurement, so an invalid pairing cannot be selected. */
  readonly massUnits = computed(() => this.unitsByDimension('mass'));
  readonly lengthUnits = computed(() => this.unitsByDimension('length'));
  readonly countUnits = computed(() => this.unitsByDimension('count'));

  /**
   * The three measurement blocks, each paired with only the units its dimension
   * allows. Weight takes mass units; length and depth take length units. Driving
   * the template from this list keeps the pairing in one place instead of
   * repeating it across three near-identical blocks.
   *
   * The options are computed per **field**, not per dimension, because retention
   * is per field: a deactivated `CM` stays selectable for the measurement that
   * already stores it, but must not become an option for the sibling field that
   * never used it — the API refuses that as a new assignment.
   */
  readonly measurementFields = computed(() => [
    { key: 'weight', labelKey: 'productSpecification.fields.weight', units: this.measurementUnits('weight') },
    { key: 'length', labelKey: 'productSpecification.fields.length', units: this.measurementUnits('length') },
    { key: 'depth', labelKey: 'productSpecification.fields.depth', units: this.measurementUnits('depth') }
  ]);

  /** Suppliers already linked, so a deactivated one still renders as a chip. */
  readonly assignedSuppliers = computed(() => this.aggregate()?.suppliers ?? []);

  /**
   * Label for the currently stored brand. The autocomplete only knows what it
   * fetched, so without this the control would look empty in edit mode even
   * though the brand is saved.
   */
  readonly brandInitialOption = computed<FieldOption | null>(() => {
    const specification = this.aggregate()?.specification;
    if (!specification?.brandId) return null;

    return { value: specification.brandId, label: { text: specification.brandName ?? '' } };
  });

  readonly form: FormGroup = this.buildForm();

  /**
   * Brand lookup for the autocomplete. It queries the API per typed term rather
   * than loading the whole catalog, and only offers active brands — an existing
   * relation to a deactivated brand is preserved by the server, not re-assigned
   * from here.
   */
  readonly brandSearch: AsyncOptionLoader = (term: string) =>
    this.brandService
      .list({ search: term, status: 'active', limit: 20 })
      .pipe(
        map((page): FieldOption[] =>
          page.data.map((brand) => ({ value: brand.id, label: { text: brand.name } }))
        )
      );

  constructor() {
    this.load();
    // Only active units are offered, and the whole active catalog is fetched
    // page by page: a unit an administrator creates becomes selectable here
    // without a deployment or a page refresh of this screen.
    this.unitService.allActive().subscribe({
      next: (units) => this.units.set(units),
      // A failed catalog load is not fatal: the summary still renders and the
      // user is told why measurements cannot be edited.
      error: () => this.units.set([])
    });
  }

  // --- reading -------------------------------------------------------------

  load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);

    this.specificationService.get(this.productId).subscribe({
      next: (aggregate) => {
        this.applyAggregate(aggregate);
        this.loading.set(false);
      },
      error: (error) => {
        this.aggregate.set(null);
        this.loadFailed.set(true);
        this.saveError.set(this.localizer.message(error));
        this.loading.set(false);
      }
    });
  }

  private applyAggregate(aggregate: ProductSpecificationAggregate): void {
    this.aggregate.set(aggregate);
    this.patchForm(aggregate);
  }

  private patchForm(aggregate: ProductSpecificationAggregate): void {
    const specification = aggregate.specification;

    this.form.patchValue({
      brandId: specification?.brandId ?? null,
      model: specification?.model ?? null,
      measurements: {
        weight: groupValue(specification?.measurements.weight),
        length: groupValue(specification?.measurements.length),
        depth: groupValue(specification?.measurements.depth)
      },
      supplierIds: aggregate.suppliers.map((supplier) => supplier.id)
    });

    const presentations = this.presentations();
    presentations.clear();
    for (const presentation of aggregate.presentations) {
      presentations.push(this.presentationGroup(presentation));
    }

    this.clearServerErrors();
    this.form.markAsPristine();
  }

  // --- form construction ---------------------------------------------------

  private buildForm(): FormGroup {
    return this.fb.group({
      brandId: [null as string | null],
      model: [null as string | null],
      measurements: this.fb.group({
        weight: this.measurementGroup(),
        length: this.measurementGroup(),
        depth: this.measurementGroup()
      }),
      presentations: this.fb.array([]),
      supplierIds: [[] as string[]]
    });
  }

  /**
   * A measurement is a value and a unit together or nothing at all. The group
   * enforces the pair locally so the user is told before the request, instead of
   * waiting for the server's `UNIT_DIMENSION_MISMATCH`.
   */
  private measurementGroup(): FormGroup {
    return this.fb.group(
      { value: [null as number | string | null], unitCode: [null as string | null] },
      { validators: [pairValidator] }
    );
  }

  private presentationGroup(presentation?: Presentation): FormGroup {
    return this.fb.group({
      id: [presentation?.id ?? null],
      name: [presentation?.name ?? '', Validators.required],
      quantity: [presentation?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      unitCode: [presentation?.unitCode ?? this.defaultQuantityUnit(), Validators.required],
      identifiers: this.fb.array(
        (presentation?.identifiers ?? []).map((identifier) =>
          this.fb.group({
            id: [identifier.id],
            type: [identifier.type as IdentifierType],
            value: [identifier.value, Validators.required]
          })
        )
      )
    });
  }

  private defaultQuantityUnit(): string {
    return this.countUnits()[0]?.code ?? '';
  }

  // --- template helpers ----------------------------------------------------

  presentations(): FormArray {
    return this.form.get('presentations') as FormArray;
  }

  addPresentation(): void {
    this.presentations().push(this.presentationGroup());
  }

  removePresentation(index: number): void {
    this.presentations().removeAt(index);
  }

  startEdit(): void {
    const aggregate = this.aggregate();
    if (!aggregate || !this.canEdit()) return;

    this.savedMessage.set(null);
    this.saveError.set(null);
    this.confirmingClear.set(false);
    this.patchForm(aggregate);
    this.mode.set('edit');
  }

  cancelEdit(): void {
    const aggregate = this.aggregate();
    if (aggregate) this.patchForm(aggregate);
    this.savedMessage.set(null);
    this.saveError.set(null);
    this.confirmingClear.set(false);
    this.mode.set('view');
  }

  measurementControl(groupName: string): FormGroup | null {
    return (this.form.get('measurements') as FormGroup).get(groupName) as FormGroup | null;
  }

  measurementError(groupName: string): string | null {
    const group = this.measurementControl(groupName);
    if (!group) return null;

    return (
      group.errors?.['server'] ??
      group.get('unitCode')?.errors?.['server'] ??
      group.get('value')?.errors?.['server'] ??
      null
    );
  }

  /** The local pair-validation message, deliberately distinct from the server's. */
  pairError(groupName: string): string | null {
    const group = this.measurementControl(groupName);
    return group?.errors?.['pair'] ? 'productSpecification.errors.pair' : null;
  }

  /** Server message for a top-level control such as `brandId`. */
  fieldError(path: string): string | null {
    return this.form.get(path)?.errors?.['server'] ?? null;
  }

  /** Narrows a `FormArray` entry to the `FormGroup` the editor expects. */
  asGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
  }

  /** The captured measurement shown in a summary row. */
  measurementOf(groupName: string): Measurement | null {
    const specification = this.aggregate()?.specification;
    if (!specification) return null;

    return specification.measurements[groupName as keyof SpecificationMeasurements] ?? null;
  }

  /** Localized label for a unit code, falling back to the code itself. */
  unitLabel(code: string | null | undefined): string {
    if (!code) return '';
    const unit = this.units().find((candidate) => candidate.code === code);
    return unit ? `${unit.name} (${unit.symbol})` : code;
  }

  /** `1.25 kg` for a captured measurement, `null` when it was not captured. */
  measurementText(measurement: Measurement | null | undefined): string | null {
    if (!measurement) return null;
    const unit = this.units().find((candidate) => candidate.code === measurement.unitCode);
    return `${measurement.value} ${unit?.symbol ?? measurement.unitCode}`;
  }

  /** Catalog key for an identifier type; the template resolves it. */
  identifierTypeKey(type: IdentifierType): string {
    return `productSpecification.identifierType.${type}`;
  }

  // --- writing -------------------------------------------------------------

  save(): void {
    this.savedMessage.set(null);
    this.saveError.set(null);
    this.clearServerErrors();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);

    this.specificationService.replace(this.productId, this.toPayload()).subscribe({
      next: (aggregate) => {
        this.saving.set(false);
        this.applyAggregate(aggregate);
        this.mode.set('view');
        this.savedMessage.set('productSpecification.states.saved');
      },
      error: (error) => {
        this.saving.set(false);
        this.applyServerErrors(error);
        this.focusFirstInvalid();
      }
    });
  }

  confirmClear(): void {
    this.confirmingClear.set(true);
  }

  cancelClear(): void {
    this.confirmingClear.set(false);
  }

  clearSpecification(): void {
    this.saving.set(true);
    this.saveError.set(null);

    this.specificationService.clear(this.productId).subscribe({
      next: (aggregate) => {
        this.saving.set(false);
        this.applyAggregate(aggregate);
        this.mode.set('view');
        this.confirmingClear.set(false);
        this.savedMessage.set('productSpecification.states.cleared');
      },
      error: (error) => {
        this.saving.set(false);
        this.confirmingClear.set(false);
        this.saveError.set(this.localizer.message(error));
      }
    });
  }

  /**
   * Builds the full-replacement body.
   *
   * Two normalisations happen here and both are deliberate:
   *
   * - A cleared number input yields `''`, not `null`. Sending `''` would be a
   *   422 and, worse, `Number('')` is `0` — and `0` means "captured as zero",
   *   which is the opposite of "not captured". Empty is therefore mapped to
   *   `null` explicitly.
   * - Supplier ids are de-duplicated, because the API rejects duplicates and a
   *   chip list can only produce them through a UI bug.
   */
  private toPayload(): ProductSpecificationPayload {
    const raw = this.form.getRawValue();

    return {
      brandId: raw.brandId || null,
      model: typeof raw.model === 'string' && raw.model.trim() !== '' ? raw.model.trim() : null,
      measurements: {
        weight: measurementPayload(raw.measurements.weight),
        length: measurementPayload(raw.measurements.length),
        depth: measurementPayload(raw.measurements.depth)
      },
      presentations: (raw.presentations as any[]).map((presentation) => ({
        ...(presentation.id ? { id: presentation.id } : {}),
        name: String(presentation.name ?? '').trim(),
        quantity: Number(presentation.quantity),
        unitCode: presentation.unitCode,
        identifiers: (presentation.identifiers ?? []).map((identifier: any) => ({
          ...(identifier.id ? { id: identifier.id } : {}),
          type: identifier.type,
          value: String(identifier.value ?? '').trim()
        }))
      })),
      supplierIds: [...new Set<string>(raw.supplierIds ?? [])]
    };
  }

  /**
   * Binds server field errors to their controls.
   *
   * `FormGroup.get` resolves a dot path with numeric indices, which is exactly
   * the shape the API uses (`presentations.0.identifiers.1.value`), so no manual
   * traversal of the nested arrays is needed.
   */
  private applyServerErrors(error: unknown): void {
    this.clearServerErrors();

    for (const [path, message] of Object.entries(this.localizer.fieldErrors(error))) {
      const control = this.form.get(path);
      if (control) control.setErrors({ server: message });
    }

    this.saveError.set(this.localizer.message(error));
  }

  private clearServerErrors(): void {
    const walk = (control: any): void => {
      const errors = control.errors;
      if (errors?.['server']) {
        const { server, ...rest } = errors;
        control.setErrors(Object.keys(rest).length > 0 ? rest : null);
      }

      if (control.controls) {
        if (Array.isArray(control.controls)) control.controls.forEach(walk);
        else Object.values(control.controls).forEach((child) => walk(child));
      }
    };

    walk(this.form);
  }

  /**
   * Moves focus to the first field the user must fix. `aria-invalid` is what the
   * editors set, so the DOM is the reliable source for "first visible invalid
   * field" — including fields inside a repeated presentation.
   */
  private focusFirstInvalid(): void {
    setTimeout(() => {
      const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      invalid?.focus();
    });
  }

  private unitsByDimension(dimension: string): UnitOption[] {
    return this.units().filter((unit) => unit.dimension === dimension);
  }

  /** Selectable options for one measurement field, retention included. */
  private measurementUnits(field: 'weight' | 'length' | 'depth'): UnitOption[] {
    const dimension = field === 'weight' ? 'mass' : 'length';
    const stored = this.aggregate()?.specification?.measurements?.[field]?.unitCode ?? null;

    return this.withHistorical(this.unitsByDimension(dimension), dimension, stored ? [stored] : []);
  }

  /**
   * Selectable options for the quantity of one presentation row.
   *
   * Only that row's own stored code is added as a historical option, so a
   * deactivated unit cannot be picked up by a sibling presentation — the API
   * treats that as a new assignment and rejects it.
   */
  countUnitsFor(index: number): UnitOption[] {
    const stored = this.presentations().at(index)?.get('unitCode')?.value ?? null;

    return this.withHistorical(this.countUnits(), 'count', stored ? [String(stored)] : []);
  }

  /**
   * Appends the stored codes the active catalog no longer offers.
   *
   * Without this the control would silently render blank for a unit that was
   * deactivated or deleted after the value was captured, and the next save would
   * look like it dropped the unit. A historical option is labelled as such in
   * the template, and the server still refuses it for a new assignment.
   */
  private withHistorical(active: UnitOfMeasure[], dimension: string, codes: string[]): UnitOption[] {
    const known = new Set(active.map((unit) => unit.code));

    const historical: UnitOption[] = [...new Set(codes)]
      .filter((code) => code !== '' && !known.has(code))
      .map((code) => ({
        id: `historical-${code}`,
        code,
        name: code,
        symbol: code,
        dimension: dimension as UnitDimension,
        decimals: 0,
        status: 'inactive',
        historical: true
      }));

    return [...active, ...historical];
  }
}

/** Both halves of a measurement, or neither. */
function pairValidator(group: FormGroup): Record<string, unknown> | null {
  const value = group.get('value')?.value;
  const unitCode = group.get('unitCode')?.value;
  const hasValue = value !== null && value !== undefined && value !== '';
  const hasUnit = unitCode !== null && unitCode !== undefined && unitCode !== '';

  return hasValue === hasUnit ? null : { pair: true };
}

function groupValue(measurement: Measurement | null | undefined): {
  value: number | null;
  unitCode: string | null;
} {
  return measurement
    ? { value: measurement.value, unitCode: measurement.unitCode }
    : { value: null, unitCode: null };
}

function measurementPayload(group: any): Measurement | null {
  const value = group?.value;
  const unitCode = group?.unitCode;

  if (value === null || value === undefined || value === '' || !unitCode) return null;

  return { value: Number(value), unitCode };
}
