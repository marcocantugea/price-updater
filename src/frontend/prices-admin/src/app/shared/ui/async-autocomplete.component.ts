import {
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject, Subscription, debounce, timer } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DisplayTextPipe } from '../display-text.pipe';
import type { AsyncOptionLoader, FieldOption } from '../crud-page.types';

/** Options returned by `search`; a bare array is accepted for convenience. */
export type AutocompleteSearchResult = FieldOption[] | { data: FieldOption[] } | null | undefined;

/** Sentinel pushed when the text no longer qualifies as a search term. */
const INVALIDATE = Symbol('invalidate');

/**
 * Asynchronous typeahead for a form control that holds a single id.
 *
 * Implemented as a `ControlValueAccessor`, so `formControlName` works exactly as
 * it does for a native `<select>`: the control value is the selected id (a
 * string), never an object. That keeps payload mapping and validation unchanged
 * for the host form.
 *
 * The suggestion list is rendered in a CDK overlay on purpose. The create/edit
 * modal is a `fixed inset-0 ... overflow-y-auto` container, so an absolutely
 * positioned list would be clipped for a field on the first row.
 */
@Component({
  selector: 'app-async-autocomplete',
  standalone: true,
  imports: [OverlayModule, TranslocoPipe, DisplayTextPipe],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AsyncAutocompleteComponent),
      multi: true
    }
  ],
  template: `
    <div class="relative">
      <input
        #field
        type="text"
        role="combobox"
        autocomplete="off"
        class="pg-input"
        [id]="id()"
        [class.pg-input-invalid]="invalid()"
        [attr.placeholder]="placeholder()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId()"
        [attr.aria-activedescendant]="activeDescendant()"
        [attr.aria-autocomplete]="'list'"
        [attr.aria-busy]="loading()"
        [attr.data-testid]="testId()"
        [disabled]="isDisabled()"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (focus)="onFocus()"
        (blur)="onBlur()"
      />

      @if (loading()) {
        <span
          class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-line border-t-forest animate-spin"
          aria-hidden="true"
          [attr.data-testid]="testId() + '-loading'"
        ></span>
      }
    </div>

    @if (showMinLengthHint()) {
      <p class="text-xs text-olive mt-1" [attr.data-testid]="testId() + '-hint'">
        {{ 'autocomplete.minLength' | transloco: { minimum: minLength() } }}
      </p>
    }

    <!--
      The panel is rendered through a template portal into a CDK overlay, which
      is what keeps it visible outside the modal's overflow container.
    -->
    <ng-template #panel>
      <div
        class="bg-surface border border-line rounded-md shadow-app max-h-64 overflow-y-auto py-1"
        [attr.data-testid]="testId() + '-panel'"
      >
        @if (statusKey(); as key) {
          <div
            class="px-3.5 py-2 text-sm text-olive flex items-center justify-between gap-3"
            [attr.data-testid]="testId() + '-status'"
          >
            <span>{{ key | transloco: statusParams() }}</span>
            @if (key === 'autocomplete.loadError') {
              <button
                type="button"
                class="shrink-0 px-2 py-1 text-xs font-medium rounded border border-line text-forest hover:bg-active transition-colors"
                [attr.data-testid]="testId() + '-retry'"
                (mousedown)="retry($event)"
              >
                {{ 'crud.retry' | transloco }}
              </button>
            }
          </div>
        } @else {
          <ul role="listbox" [id]="listId()" class="m-0 p-0 list-none">
            @for (option of options(); track option.value; let index = $index) {
              <li
                role="option"
                [id]="optionId(index)"
                [attr.aria-selected]="index === activeIndex()"
                class="px-3.5 py-2 text-sm cursor-pointer"
                [class]="index === activeIndex() ? 'bg-active text-forest' : 'text-forest hover:bg-sidebar'"
                [attr.data-testid]="testId() + '-option'"
                (mouseenter)="activeIndex.set(index)"
                (mousedown)="select(option, $event)"
              >
                {{ option.label | displayText }}
              </li>
            }
          </ul>
        }
      </div>
    </ng-template>
  `
})
export class AsyncAutocompleteComponent implements ControlValueAccessor {
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>('');
  /** Resolved copy: the caller owns the catalog key, as in the other shared UI. */
  readonly placeholder = input<string>('');
  /** Query-aware source. Receives the trimmed term and returns the options. */
  readonly search = input<AsyncOptionLoader | null>(null);
  readonly minLength = input<number>(4);
  readonly debounceMs = input<number>(300);
  readonly testId = input<string>('async-autocomplete');
  /** Renders the built-in required/invalid treatment. */
  readonly invalid = input<boolean>(false);
  /**
   * Label of the current selection when the form already holds an id and no
   * search was performed, which is the edit case. Only the label comes from
   * here; the control value stays the id.
   */
  readonly initialOption = input<FieldOption | null>(null);

  readonly optionSelected = output<FieldOption>();

  @ViewChild('panel', { static: true }) private panelTemplate!: TemplateRef<unknown>;
  @ViewChild('field', { static: true }) private fieldRef!: ElementRef<HTMLInputElement>;

  /** Text shown in the input, which is NOT the control value once selected. */
  readonly query = signal('');
  readonly options = signal<FieldOption[]>([]);
  readonly loading = signal(false);
  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  readonly isDisabled = signal(false);
  /** Catalog key of the panel message when there are no options to list. */
  readonly statusKey = signal<string | null>(null);
  readonly statusParams = signal<Record<string, unknown>>({});

  readonly listId = computed(() => `${this.testId()}-listbox`);

  /**
   * Tells the user why nothing is being searched yet. Without it a short term
   * looks like a broken control rather than a minimum-length rule.
   */
  readonly showMinLengthHint = computed(() => {
    const term = this.query().trim();
    return !this.isDisabled() && term.length > 0 && term.length < this.minLength();
  });

  readonly activeDescendant = computed(() => {
    const index = this.activeIndex();
    return this.open() && index >= 0 ? this.optionId(index) : null;
  });

  /** The id held by the form control. */
  private readonly selectedId = signal<string | null>(null);
  /** Terms to search, or `INVALIDATE` when the text is too short to search. */
  private readonly terms = new Subject<string | typeof INVALIDATE>();
  private readonly retryTrigger = new Subject<void>();
  private overlayRef: OverlayRef | null = null;
  private panelOpen = false;
  private pendingRequest: Subscription | null = null;
  private onChange: (value: string | null) => void = () => undefined;
  onTouched: () => void = () => undefined;

  constructor() {
    // The duration is read per emission, not once when the pipe is built: signal
    // inputs are only assigned after the constructor runs, so `debounceTime(x)`
    // here would capture the default instead of the configured value.
    this.terms
      .pipe(
        debounce(() => timer(this.debounceMs())),
        takeUntilDestroyed()
      )
      .subscribe((term) => {
        if (term === INVALIDATE) return;

        const source = this.search();
        if (!source) return;

        // Cancelling the previous request is what stops a slow response from
        // overwriting the suggestions of a newer term.
        this.cancelPending();
        this.loading.set(true);
        this.statusKey.set(null);

        this.pendingRequest = source(term).subscribe({
          next: (result) => {
            this.pendingRequest = null;
            const options = Array.isArray(result) ? result : result?.data ?? [];
            this.loading.set(false);
            this.options.set(options);
            this.activeIndex.set(options.length > 0 ? 0 : -1);
            this.statusKey.set(options.length === 0 ? 'autocomplete.noResults' : null);
            this.openPanel();
          },
          error: () => {
            // A failed request is never a valid selection, so nothing is assigned
            // to the control and the panel explains what happened.
            this.pendingRequest = null;
            this.loading.set(false);
            this.options.set([]);
            this.activeIndex.set(-1);
            this.statusKey.set('autocomplete.loadError');
            this.openPanel();
          }
        });
      });

    this.terms
      .pipe(takeUntilDestroyed())
      .subscribe((term) => {
        if (term !== INVALIDATE) return;
        this.cancelPending();
        this.loading.set(false);
        this.options.set([]);
        this.statusKey.set(null);
        this.closePanel();
      });

    // A retry re-runs the current term without the user typing again.
    this.retryTrigger
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.terms.next(this.query().trim()));

    // The edit case: the form holds an id with no search performed.
    toObservable(this.initialOption)
      .pipe(takeUntilDestroyed())
      .subscribe((option) => this.syncInitialOption(option));

    this.destroyRef.onDestroy(() => this.cancelPending());
  }

  /** Cancels the in-flight request, if any, and drops its loading state. */
  private cancelPending(): void {
    this.pendingRequest?.unsubscribe();
    this.pendingRequest = null;
    this.loading.set(false);
  }

  // --- ControlValueAccessor ------------------------------------------------

  writeValue(value: unknown): void {
    const id = typeof value === 'string' && value !== '' ? value : null;
    this.selectedId.set(id);

    if (id === null) {
      this.query.set('');
      this.closePanel();
      return;
    }

    const current = this.options().find((option) => option.value === id);
    if (current) {
      this.query.set(this.labelText(current));
      return;
    }

    const initial = this.initialOption();
    this.query.set(initial && initial.value === id ? this.labelText(initial) : id);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) this.closePanel();
  }

  // --- interaction ---------------------------------------------------------

  onInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.query.set(term);

    // Typing invalidates the previous selection: an id without a matching label
    // is exactly the state that must not be submittable.
    if (this.selectedId() !== null) {
      this.selectedId.set(null);
      this.onChange(null);
    }

    const trimmed = term.trim();
    if (trimmed.length < this.minLength()) {
      this.terms.next(INVALIDATE);
      return;
    }

    this.terms.next(trimmed);
  }

  onFocus(): void {
    if (this.options().length > 0 || this.loading()) this.openPanel();
  }

  onBlur(): void {
    this.onTouched();
    this.closePanel();
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          return;
        }
        this.moveActive(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        return;
      case 'Enter': {
        const index = this.activeIndex();
        const option = this.open() ? this.options()[index] : undefined;
        // Only an explicit selection commits; a bare Enter never submits an
        // unknown id.
        if (option) {
          event.preventDefault();
          this.select(option, event);
        }
        return;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.closePanel();
        }
        return;
      case 'Tab':
        // Leaving the field must not select whatever happens to be active.
        this.closePanel();
        return;
      default:
        return;
    }
  }

  select(option: FieldOption, event?: Event): void {
    // Keep focus in the input; the overlay lives outside it.
    event?.preventDefault();
    this.selectedId.set(option.value);
    this.query.set(this.labelText(option));
    this.options.set([]);
    this.statusKey.set(null);
    this.closePanel();
    this.onChange(option.value);
    this.onTouched();
    this.optionSelected.emit(option);
  }

  retry(event?: Event): void {
    event?.preventDefault();
    this.retryTrigger.next();
  }

  // --- panel ---------------------------------------------------------------

  private syncInitialOption(option: FieldOption | null): void {
    const id = this.selectedId();
    if (!option || !id || option.value !== id) return;
    if (this.options().some((candidate) => candidate.value === id)) return;
    this.query.set(this.labelText(option));
  }

  private openPanel(): void {
    if (this.panelOpen || this.isDisabled()) return;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.fieldRef)
      .withFlexibleDimensions(false)
      .withPush(false)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: false,
      panelClass: 'pg-autocomplete-panel'
    });

    const host = this.fieldRef.nativeElement.parentElement ?? this.fieldRef.nativeElement;
    this.overlayRef.updateSize({ width: `${host.getBoundingClientRect().width}px` });
    this.overlayRef.attach(new TemplatePortal(this.panelTemplate, this.viewContainerRef));
    this.panelOpen = true;
    this.open.set(true);
  }

  private closePanel(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.panelOpen = false;
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  private moveActive(step: number): void {
    const total = this.options().length;
    if (total === 0) return;
    this.activeIndex.set((this.activeIndex() + step + total) % total);
  }

  /** Public because the template binds `id` for every option. */
  optionId(index: number): string {
    return `${this.testId()}-option-${index}`;
  }

  /** Plain text of a display label, used as the input's visible value. */
  private labelText(option: FieldOption): string {
    const label = option.label;
    if ('text' in label) return label.text;
    return this.transloco.translate(label.key, label.params ?? {});
  }
}
