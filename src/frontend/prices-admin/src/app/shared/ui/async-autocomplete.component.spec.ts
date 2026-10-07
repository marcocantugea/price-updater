import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { AsyncAutocompleteComponent } from './async-autocomplete.component';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import type { FieldOption } from '../crud-page.types';

const OPTIONS: FieldOption[] = [
  { value: 'prod-1', label: { text: 'CAFE-1000 — Cafetera' } },
  { value: 'prod-2', label: { text: 'TOST-2000 — Tostadora' } }
];

/** Reads a panel rendered into the CDK overlay, outside the host's DOM. */
function panel(testId: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testId}-panel"]`);
}

function panelOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-testid="product-option"]'));
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, AsyncAutocompleteComponent],
  template: `
    <app-async-autocomplete
      [id]="'field-product'"
      [placeholder]="'Buscar producto'"
      [search]="search"
      [minLength]="4"
      [debounceMs]="10"
      [testId]="'product'"
      [initialOption]="initialOption"
      [formControl]="control"
    />
  `
})
class HostComponent {
  readonly control = new FormControl<string | null>('');
  search: ((term: string) => any) | null = () => of(OPTIONS);
  initialOption: FieldOption | null = null;
}

describe('AsyncAutocompleteComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let calls: string[];

  /** Builds the host, optionally with a custom search source. */
  function build(search?: (term: string) => any): void {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.search =
      search ??
      ((term: string) => {
        calls.push(term);
        return of(OPTIONS);
      });
    fixture.detectChanges();
  }

  function field(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input') as HTMLInputElement;
  }

  /** Types into the field and lets the debounce elapse. */
  function type(value: string, elapsed = 10): void {
    const element = field();
    element.value = value;
    element.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    tick(elapsed);
    fixture.detectChanges();
    flushOverlay();
  }

  /** Lets the overlay render; positioning runs on an animation frame. */
  function flushOverlay(): void {
    tick(0);
  }

  beforeEach(() => {
    calls = [];
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: []
    });
    installTestTranslations();
  });

  afterEach(() => {
    fixture?.destroy();
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('does not search below the minimum length and explains why', fakeAsync(() => {
    build();

    type('caf');

    expect(calls).toEqual([]);
    expect(panel('product')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="product-hint"]')?.textContent).toContain('4');
  }));

  it('searches the trimmed term after the debounce and lists the options', fakeAsync(() => {
    build();

    type('  cafe  ');

    expect(calls).toEqual(['cafe']);
    expect(panel('product')).not.toBeNull();
    expect(panelOptions().length).toBe(2);
    expect(panelOptions()[0].textContent).toContain('CAFE-1000 — Cafetera');
  }));

  it('debounces so a fast sequence of keystrokes issues one request', fakeAsync(() => {
    build();

    const element = field();
    for (const value of ['cafe', 'cafe-', 'cafe-1']) {
      element.value = value;
      element.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      tick(3);
    }
    tick(10);
    fixture.detectChanges();
    flushOverlay();

    expect(calls).toEqual(['cafe-1']);
  }));

  it('writes the option value to the form control on selection and shows its label', fakeAsync(() => {
    build();

    type('cafe');
    panelOptions()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(host.control.value).toBe('prod-1');
    expect(field().value).toBe('CAFE-1000 — Cafetera');
    expect(panel('product')).toBeNull();
  }));

  it('selects with the keyboard and tracks the active option', fakeAsync(() => {
    build();

    type('cafe');
    const element = field();

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(element.getAttribute('aria-activedescendant')).toBe('product-option-1');

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    fixture.detectChanges();
    expect(element.getAttribute('aria-activedescendant')).toBe('product-option-0');

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(host.control.value).toBe('prod-1');
    expect(panel('product')).toBeNull();
  }));

  it('closes on Escape without selecting', fakeAsync(() => {
    build();

    type('cafe');
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(panel('product')).toBeNull();
    expect(host.control.value).toBe('');
  }));

  it('does not select on Tab', fakeAsync(() => {
    build();

    type('cafe');
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    fixture.detectChanges();

    expect(host.control.value).toBe('');
    expect(panel('product')).toBeNull();
  }));

  it('shows a no-results message when the search is empty', fakeAsync(() => {
    build(() => of([]));

    type('zzzz');

    expect(panel('product')).not.toBeNull();
    expect(panelOptions().length).toBe(0);
    expect(document.querySelector('[data-testid="product-status"]')?.textContent).toContain('Sin resultados');
  }));

  it('reports a failed request without treating it as a selection', fakeAsync(() => {
    build(() => throwError(() => new Error('boom')));

    type('cafe');

    expect(host.control.value).toBe('');
    expect(document.querySelector('[data-testid="product-status"]')?.textContent).toContain(
      'No se pudieron cargar las opciones'
    );
    // The failure offers a retry instead of a dead end.
    expect(document.querySelector('[data-testid="product-retry"]')).not.toBeNull();
  }));

  it('retries the current term without retyping', fakeAsync(() => {
    let attempt = 0;
    build((term: string) => {
      calls.push(term);
      attempt += 1;
      return attempt === 1 ? throwError(() => new Error('boom')) : of(OPTIONS);
    });

    type('cafe');
    expect(calls).toEqual(['cafe']);

    const retry = document.querySelector('[data-testid="product-retry"]') as HTMLElement;
    retry.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    tick(10);
    fixture.detectChanges();
    flushOverlay();

    expect(calls).toEqual(['cafe', 'cafe']);
    expect(panelOptions().length).toBe(2);
  }));

  it('clears the value when the text changes after a selection', fakeAsync(() => {
    build();

    type('cafe');
    panelOptions()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.control.value).toBe('prod-1');

    type('tost');

    expect(host.control.value).toBeNull();
  }));

  it('clears the displayed label when the control is reset', fakeAsync(() => {
    build();

    type('cafe');
    panelOptions()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    host.control.setValue(null);
    fixture.detectChanges();

    expect(field().value).toBe('');
  }));

  it('renders an initial option without searching, for the edit case', fakeAsync(() => {
    build();

    host.control.setValue('prod-9');
    fixture.detectChanges();

    // No label is known yet, so the raw id is shown and nothing is searched.
    expect(field().value).toBe('prod-9');
    expect(calls).toEqual([]);

    // The page then supplies the label from the row it is editing.
    host.initialOption = { value: 'prod-9', label: { text: 'SKU-9 — Antiguo' } };
    fixture.detectChanges();

    expect(field().value).toBe('SKU-9 — Antiguo');
    expect(calls).toEqual([]);
    expect(host.control.value).toBe('prod-9');
  }));

  it('re-syncs the label when the initial option arrives before the value', fakeAsync(() => {
    build();

    host.initialOption = { value: 'prod-9', label: { text: 'SKU-9 — Antiguo' } };
    fixture.detectChanges();

    host.control.setValue('prod-9');
    fixture.detectChanges();

    expect(field().value).toBe('SKU-9 — Antiguo');
  }));

  it('marks the field invalid and exposes combobox accessibility state', fakeAsync(() => {
    build();

    const element = field();
    expect(element.getAttribute('role')).toBe('combobox');
    expect(element.getAttribute('aria-expanded')).toBe('false');
    expect(element.getAttribute('aria-controls')).toBe('product-listbox');
    expect(element.getAttribute('aria-activedescendant')).toBeNull();

    type('cafe');

    expect(element.getAttribute('aria-expanded')).toBe('true');
    expect(element.getAttribute('aria-activedescendant')).toBe('product-option-0');
    const listbox = document.querySelector('#product-listbox');
    expect(listbox?.getAttribute('role')).toBe('listbox');
    expect(listbox?.querySelectorAll('[role="option"]').length).toBe(2);
  }));
});
