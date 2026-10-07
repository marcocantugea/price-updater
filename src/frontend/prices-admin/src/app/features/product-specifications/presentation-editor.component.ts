import { Component, inject, input, output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { IdentifierType, UnitOption } from '../../core/models';

/**
 * Editor for one presentation inside the aggregate's `FormArray`.
 *
 * The component owns its own subtree: the parent passes the `FormGroup` and gets
 * a `remove` event back, while identifiers are added and removed here. That keeps
 * the page's template from nesting three levels of form directives and gives the
 * identifier rules (which types exist, what a row looks like) exactly one home.
 *
 * It is only ever rendered in edit mode; the read-only presentation of the same
 * data is a separate summary in the page.
 */
@Component({
  selector: 'app-presentation-editor',
  standalone: true,
  imports: [ReactiveFormsModule, TranslocoPipe],
  template: `
    <fieldset [formGroup]="group()" class="rounded-lg border border-line bg-surface p-4">
      <legend class="px-1 text-sm font-semibold text-forest">
        {{ 'productSpecification.sections.presentations' | transloco }} {{ index() + 1 }}
      </legend>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="pg-label">{{ 'productSpecification.fields.presentationName' | transloco }}</span>
          <input
            class="pg-input mt-1"
            type="text"
            formControlName="name"
            data-testid="presentation-name"
            [attr.placeholder]="'productSpecification.fields.presentationNamePlaceholder' | transloco"
            [attr.aria-invalid]="!!errorOf('name')"
          />
          @if (errorOf('name'); as message) {
            <span class="mt-1 block text-xs text-danger">{{ message }}</span>
          }
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="pg-label">{{ 'productSpecification.fields.quantity' | transloco }}</span>
            <input
              class="pg-input mt-1"
              type="number"
              min="0.001"
              step="0.001"
              formControlName="quantity"
              data-testid="presentation-quantity"
              [attr.aria-invalid]="!!errorOf('quantity')"
            />
            @if (errorOf('quantity'); as message) {
              <span class="mt-1 block text-xs text-danger">{{ message }}</span>
            }
          </label>

          <label class="block">
            <span class="pg-label">{{ 'productSpecification.fields.unit' | transloco }}</span>
            <select class="pg-input mt-1" formControlName="unitCode" data-testid="presentation-unit" [attr.aria-invalid]="!!errorOf('unitCode')">
              <option value="">{{ 'common.selectOption' | transloco }}</option>
              @for (unit of units(); track unit.code) {
                <option [value]="unit.code">
                  {{ unit.name }} ({{ unit.symbol }}){{ unit.historical ? ' — ' + ('productSpecification.units.historical' | transloco) : '' }}
                </option>
              }
            </select>
            @if (errorOf('unitCode'); as message) {
              <span class="mt-1 block text-xs text-danger">{{ message }}</span>
            }
          </label>
        </div>
      </div>

      <div class="mt-4" formArrayName="identifiers">
        <span class="pg-label">{{ 'productSpecification.fields.identifierValue' | transloco }}</span>

        @for (identifier of identifiers.controls; track identifier; let i = $index) {
          <div class="mt-2 grid items-start gap-2 sm:grid-cols-[9rem_1fr_auto]" [formGroupName]="i">
            <label class="block">
              <span class="sr-only">{{ 'productSpecification.fields.identifierType' | transloco }}</span>
              <select class="pg-input" formControlName="type" data-testid="identifier-type">
                @for (type of identifierTypes; track type) {
                  <option [value]="type">{{ 'productSpecification.identifierType.' + type | transloco }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="sr-only">{{ 'productSpecification.fields.identifierValue' | transloco }}</span>
              <input
                class="pg-input"
                type="text"
                inputmode="numeric"
                formControlName="value"
                data-testid="identifier-value"
                [attr.aria-invalid]="!!identifierError(i, 'value')"
              />
              @if (identifierError(i, 'value'); as message) {
                <span class="mt-1 block text-xs text-danger">{{ message }}</span>
              }
            </label>

            <button
              type="button"
              class="rounded border border-line px-3 py-2 text-sm text-danger hover:border-danger"
              [attr.aria-label]="'productSpecification.actions.removeIdentifier' | transloco"
              (click)="removeIdentifier(i)"
            >
              {{ 'common.delete' | transloco }}
            </button>
          </div>
        } @empty {
          <p class="mt-2 text-sm text-olive">
            {{ 'productSpecification.presentations.identifiersEmpty' | transloco }}
          </p>
        }

        <button
          type="button"
          class="mt-3 rounded border border-line px-3 py-1 text-sm text-forest hover:border-forest"
          data-testid="add-identifier"
          (click)="addIdentifier()"
        >
          {{ 'productSpecification.actions.addIdentifier' | transloco }}
        </button>
      </div>

      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="text-sm text-danger underline"
          (click)="remove.emit()"
        >
          {{ 'productSpecification.actions.removePresentation' | transloco }}
        </button>
      </div>
    </fieldset>
  `
})
export class PresentationEditorComponent {
  private readonly fb = inject(FormBuilder);

  readonly group = input.required<FormGroup>();
  readonly index = input.required<number>();
  /** Units whose dimension is `count`, since a quantity is a number of things. */
  readonly units = input<UnitOption[]>([]);

  readonly remove = output<void>();

  readonly identifierTypes: IdentifierType[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

  get identifiers(): FormArray {
    return this.group().get('identifiers') as FormArray;
  }

  /** Server-side messages are attached to controls as a `server` error. */
  errorOf(controlName: string): string | null {
    const control = this.group().get(controlName);
    return control?.errors?.['server'] ?? null;
  }

  identifierError(index: number, controlName: string): string | null {
    const control = this.identifiers.at(index)?.get(controlName);
    return control?.errors?.['server'] ?? null;
  }

  addIdentifier(): void {
    this.identifiers.push(
      this.fb.group({
        id: [null as string | null],
        type: ['ean_13' as IdentifierType],
        value: ['']
      })
    );
  }

  removeIdentifier(index: number): void {
    this.identifiers.removeAt(index);
  }
}
