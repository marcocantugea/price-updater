import { Component, DestroyRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SupplierService } from '../../core/services/catalog.services';

/**
 * Supplier selection as toggleable chips, exposed as a `ControlValueAccessor`
 * over `string[]` so it binds with `formControlName` like any other control.
 *
 * Three behaviours matter here and are easy to get wrong:
 *
 * 1. **The search is server-side.** The catalog can grow past any page size, so
 *    the picker queries the API with the typed term instead of assuming its first
 *    page is the whole catalog — a supplier beyond row 100 is still assignable.
 * 2. **Already-linked suppliers always render.** The list only returns active
 *    suppliers, but an existing link to a deactivated or deleted one is
 *    legitimate and must be preserved (the API refuses to *newly* assign one).
 *    Without the `assigned` input the chip would disappear and the next save
 *    would silently drop the link.
 * 3. **The three empty states are different.** "No active suppliers in the
 *    catalog", "this filter matches nothing" and "the catalog could not be
 *    loaded" need different copy, because only the last one is a retryable
 *    failure.
 *
 * Selection state is exposed through `aria-pressed` as well as colour, so the
 * state is not conveyed by colour alone.
 */
@Component({
  selector: 'app-supplier-picker',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SupplierPickerComponent), multi: true }
  ],
  template: `
    <div class="space-y-3">
      <input
        class="pg-input"
        type="search"
        data-testid="supplier-filter"
        [disabled]="disabled()"
        [placeholder]="'productSpecification.suppliers.filterPlaceholder' | transloco"
        [attr.aria-label]="'productSpecification.suppliers.filterPlaceholder' | transloco"
        [ngModel]="filter()"
        (ngModelChange)="onFilterChange($event)"
      />

      @if (loadFailed()) {
        <p class="flex flex-wrap items-center gap-2 text-sm text-danger" data-testid="supplier-picker-error">
          {{ 'productSpecification.suppliers.loadFailed' | transloco }}
          <button type="button" class="underline" (click)="reload()" data-testid="supplier-picker-retry">
            {{ 'productSpecification.errors.retry' | transloco }}
          </button>
        </p>
      }

      <div class="flex flex-wrap gap-2" role="group">
        @for (option of visible(); track option.id) {
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition"
            [class]="
              isSelected(option.id)
                ? 'border-forest bg-active text-forest'
                : 'border-line bg-surface text-olive hover:text-forest'
            "
            [disabled]="disabled()"
            [attr.aria-pressed]="isSelected(option.id)"
            (click)="toggle(option.id)"
          >
            {{ option.name }}
          </button>
        } @empty {
          @if (!loadFailed() && !loading()) {
            <p class="text-sm text-olive" data-testid="supplier-picker-empty">
              {{
                (filter()
                  ? 'productSpecification.suppliers.noMatch'
                  : 'productSpecification.suppliers.empty') | transloco
              }}
            </p>
          }
        }
      </div>

      <p class="text-xs text-olive">
        {{ 'productSpecification.suppliers.selectedCount' | transloco: { count: value().length } }}
      </p>
    </div>
  `
})
export class SupplierPickerComponent implements ControlValueAccessor {
  private readonly supplierService = inject(SupplierService);
  private readonly destroyRef = inject(DestroyRef);

  /** Suppliers already linked to the product, deactivated ones included. */
  readonly assigned = input<{ id: string; name: string | null }[]>([]);

  readonly disabled = signal(false);
  readonly filter = signal('');
  readonly value = signal<string[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  /** Suppliers the last query returned, in the order the API produced them. */
  private readonly results = signal<{ id: string; name: string }[]>([]);
  private readonly filterChanges = new Subject<string>();

  /**
   * Assigned rows first, then the server's answer, without duplicates.
   *
   * The assigned chips bypass the query on purpose: a selected supplier that the
   * current filter does not return — because it is inactive, deleted, or simply
   * named differently — must stay visible so it can be kept or removed
   * deliberately instead of disappearing while still counting as selected.
   */
  readonly visible = computed(() => {
    const names = new Map<string, string>();

    for (const linked of this.assigned()) names.set(linked.id, linked.name ?? '');
    for (const option of this.results()) names.set(option.id, option.name);

    return [...names.entries()].map(([id, name]) => ({ id, name }));
  });

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Debounced so typing does not fire one request per keystroke, and
    // `distinctUntilChanged` so re-typing the same term is free.
    this.filterChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.search(term));

    this.search('');
  }

  /** Retries the current term after a failed load. */
  reload(): void {
    this.search(this.filter().trim());
  }

  onFilterChange(term: string): void {
    this.filter.set(term);
    this.filterChanges.next(term.trim());
  }

  isSelected(id: string): boolean {
    return this.value().includes(id);
  }

  toggle(id: string): void {
    if (this.disabled()) return;

    const next = this.isSelected(id)
      ? this.value().filter((selected) => selected !== id)
      : [...this.value(), id];

    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }

  writeValue(value: string[] | null): void {
    this.value.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private search(term: string): void {
    this.loading.set(true);

    this.supplierService
      .list({ search: term || undefined, status: 'active', limit: 20, sort: 'name', order: 'asc' })
      .subscribe({
        next: (page) => {
          this.results.set(page.data.map((supplier) => ({ id: supplier.id, name: supplier.name })));
          this.loadFailed.set(false);
          this.loading.set(false);
        },
        error: () => {
          // A failed catalog load does not block the page: the assigned chips
          // still render, so the user can keep what is already linked.
          this.results.set([]);
          this.loadFailed.set(true);
          this.loading.set(false);
        }
      });
  }
}
