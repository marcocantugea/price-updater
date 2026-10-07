import { Component } from '@angular/core';
import { installTestTranslations, provideTranslocoTesting } from '../testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { CrudPageComponent } from './crud-page.component';
import { ToastService } from '../core/services/toast.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { LanguageService } from '../core/i18n/language.service';
import type { CrudResource } from '../core/services/crud-resource';
import type { ColumnConfig, CrudMessages, FieldConfig, RowAction } from './crud-page.types';

class FakeResource {
  list = jasmine
    .createSpy('list')
    .and.returnValue(
      of({
        data: [{ id: 'p1', name: 'Cafetera', basePrice: 100, currencyCode: 'MXN', status: 'active' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 }
      })
    );
  create = jasmine.createSpy('create').and.returnValue(of({ id: 'new' }));
  update = jasmine.createSpy('update').and.returnValue(of({ id: 'p1' }));
  remove = jasmine.createSpy('remove').and.returnValue(of({ id: 'p1' }));
}

@Component({
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Productos"
      subtitle="Catálogo"
      entityLabel="producto"
      [columns]="columns"
      [fields]="fields"
      [rowActions]="rowActions"
      [messages]="crudMessages"
      [service]="service"
      [canCreate]="true"
      [canEdit]="true"
      [canDelete]="true"
      [pageSize]="10"
    />
  `
})
class HostComponent {
  service: CrudResource<any> = new FakeResource() as unknown as CrudResource<any>;
  columns: ColumnConfig[] = [
    // A catalog key on a column: the label must follow a runtime switch.
    { key: 'name', label: { key: 'common.record' }, sortable: true },
    { key: 'basePrice', label: { text: 'Precio' }, type: 'money', currencyKey: 'currencyCode' },
    { key: 'status', label: { text: 'Estado' }, type: 'status' }
  ];
  fields: FieldConfig[] = [
    { key: 'name', label: { key: 'common.record' }, type: 'text', required: true },
    { key: 'basePrice', label: { text: 'Precio' }, type: 'number', required: true, min: 0 }
  ];
  rowActions: RowAction[] = [
    // Dynamic business data must render verbatim.
    { label: { text: 'Listas autorizadas' }, run: () => undefined }
  ];
  crudMessages: CrudMessages = {};
}

describe('CrudPageComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let fake: FakeResource;
  let page: CrudPageComponent;
  let toast: ToastService;
  let language: LanguageService;

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HostComponent, provideTranslocoTesting()]
    }).compileComponents();

    installTestTranslations();
    language = TestBed.inject(LanguageService);

    fixture = TestBed.createComponent(HostComponent);
    fake = fixture.componentInstance.service as unknown as FakeResource;
    toast = TestBed.inject(ToastService);
    toast.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  function create(): void {
    fixture.detectChanges();
    page = fixture.debugElement.query(By.directive(CrudPageComponent)).componentInstance;
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  function click(testId: string): void {
    fixture.debugElement.query(By.css(`[data-testid="${testId}"]`)).nativeElement.click();
    fixture.detectChanges();
  }

  it('renders the header and the loaded rows', () => {
    create();

    expect(text()).toContain('Productos');
    expect(text()).toContain('Cafetera');
    expect(text()).toContain('100.00');
    expect(fixture.nativeElement.querySelector('[data-testid="data-table"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-summary"]').textContent).toContain(
      '1 registros'
    );
  });

  // --- Phase 3: translated chrome ------------------------------------------

  it('translates the CRUD chrome instead of hard-coding it', () => {
    create();

    expect(text()).toContain('Actualizar');
    expect(text()).toContain('Acciones');
    expect(text()).toContain('Editar');
    expect(text()).toContain('Eliminar');
    expect(text()).toContain('Todos');
    expect(text()).toContain('Activos');
    expect(text()).toContain('Inactivos');
    expect(text()).toContain('Anterior');
    expect(text()).toContain('Siguiente');
    expect(text()).toContain('Página 1 de 1 · 1 registros');
    // The search placeholder is a translated attribute, not literal copy.
    expect(
      fixture.nativeElement.querySelector('[data-testid="search-input"]').getAttribute('placeholder')
    ).toBe('Buscar…');
  });

  it('renders catalog keys and literals side by side', () => {
    create();

    // `{ key }` resolves to the catalog, `string` is still a transitional literal.
    expect(text()).toContain('registro');
    expect(text()).toContain('Precio');
  });

  it('keeps dynamic API labels verbatim', () => {
    create();

    expect(text()).toContain('Listas autorizadas');
  });

  it('rerenders the whole chrome on a runtime language switch', () => {
    create();
    expect(text()).toContain('Actualizar');

    language.setLocale('en-US');
    fixture.detectChanges();

    expect(text()).toContain('Refresh');
    expect(text()).toContain('Actions');
    expect(text()).toContain('Edit');
    expect(text()).toContain('Delete');
    expect(text()).toContain('All');
    expect(text()).toContain('Page 1 of 1 · 1 records');
    // Column keys and dynamic data both follow/keep their language correctly.
    expect(text()).toContain('record');
    expect(text()).toContain('Listas autorizadas');
    expect(fixture.nativeElement.querySelector('[data-testid="search-input"]').getAttribute('placeholder')).toBe(
      'Search…'
    );
  });

  it('detects an untranslated key leaking into the UI', () => {
    create();

    // A raw key would render as `common.actions`; the catalog coverage test
    // catches it, and this guards the rendered output too.
    expect(text()).not.toMatch(/common\.[a-zA-Z]/);
    expect(text()).not.toMatch(/crud\.[a-zA-Z]/);
  });

  // --- states --------------------------------------------------------------

  it('shows the loading state while the request is in flight', () => {
    const subject = new Subject<any>();
    fake.list.and.returnValue(subject);

    create();

    expect(fixture.nativeElement.querySelector('[data-state="loading"]')).toBeTruthy();
    expect(text()).toContain('Cargando…');

    subject.next({
      data: [{ id: 'p1', name: 'Cafetera', basePrice: 100, currencyCode: 'MXN', status: 'active' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 }
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-state="loading"]')).toBeNull();
    expect(text()).toContain('Cafetera');
  });

  it('shows the empty state when there are no records', () => {
    fake.list.and.returnValue(of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }));

    create();

    expect(fixture.nativeElement.querySelector('[data-state="empty"]')).toBeTruthy();
    expect(text()).toContain('Sin resultados');
    expect(text()).toContain('Aún no hay registros');
  });

  it('shows the error state and retries', () => {
    fake.list.and.returnValue(throwError(() => ({ error: { message: 'Servidor no disponible' } })));

    create();

    expect(fixture.nativeElement.querySelector('[data-state="error"]')).toBeTruthy();
    expect(text()).toContain('Servidor no disponible');

    fake.list.and.returnValue(of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }));
    fixture.debugElement.query(By.css('[data-state="error"] button')).nativeElement.click();
    fixture.detectChanges();

    expect(fake.list).toHaveBeenCalledTimes(2);
  });

  // --- create / edit / delete ---------------------------------------------

  it('creates a record through the modal form', () => {
    create();
    click('create-button');

    // One complete translated sentence, not `Nuevo ` + entity.
    expect(text()).toContain('Añadir producto');

    page.form.patchValue({ name: 'Tostadora', basePrice: 50 });
    click('submit-button');

    expect(fake.create).toHaveBeenCalledWith({ name: 'Tostadora', basePrice: 50 });
    // The toast is also a complete sentence with the entity interpolated.
    const success = toast.toasts().find((item) => item.kind === 'success');
    expect(success?.message).toBe('Se añadió producto correctamente.');
  });

  it('uses complete sentences for the create and edit toasts', () => {
    create();

    click('create-button');
    page.form.patchValue({ name: 'X', basePrice: 1 });
    page.submit();
    expect(toast.toasts().some((item) => item.message === 'Se añadió producto correctamente.')).toBe(true);

    toast.clear();
    click('edit-button');
    page.form.patchValue({ name: 'Y' });
    page.submit();
    expect(toast.toasts().some((item) => item.message === 'Se actualizó producto correctamente.')).toBe(true);
  });

  it('blocks submission while the form is invalid', () => {
    create();
    click('create-button');
    click('submit-button');

    expect(fake.create).not.toHaveBeenCalled();
  });

  it('shows the localized invalid-form message', () => {
    create();
    click('create-button');

    // Cross-field/root failure path: the whole-form message is translated.
    expect(page.invalidFormMessage()).toBe('Revisa los campos marcados.');

    language.setLocale('en-US');
    expect(page.invalidFormMessage()).toBe('Please review the highlighted fields.');
  });

  it('lets a page replace a chrome message with its own whole sentence', () => {
    // The host supplies complete sentences; nothing is concatenated. They are
    // literals here only because the page owns that copy.
    fixture.componentInstance.crudMessages = {
      create: { text: 'Dar de alta un producto' },
      created: { text: 'Producto dado de alta.' },
      deleteMessage: { text: 'Vas a dar de baja el producto seleccionado.' }
    };
    create();

    expect(page.createLabel()).toBe('Dar de alta un producto');
    expect(page.modalTitle()).toBe('Dar de alta un producto');
    expect(page.deleteMessage()).toBe('Vas a dar de baja el producto seleccionado.');

    click('create-button');
    page.form.patchValue({ name: 'X', basePrice: 1 });
    page.submit();
    expect(toast.toasts().some((item) => item.message === 'Producto dado de alta.')).toBe(true);
  });

  it('keeps the entity interpolation in the default messages', () => {
    create();

    expect(page.entity()).toBe('producto');
    expect(page.createLabel()).toBe('Añadir producto');
    expect(page.editLabel()).toBe('Editar producto');

    language.setLocale('en-US');
    expect(page.createLabel()).toBe('Add producto');
  });

  it('opens the edit modal prefilled and updates the record', () => {
    create();

    click('edit-button');

    expect(text()).toContain('Editar producto');
    expect(page.form.get('name')?.value).toBe('Cafetera');

    page.form.patchValue({ name: 'Cafetera premium' });
    page.submit();

    expect(fake.update).toHaveBeenCalledWith('p1', jasmine.objectContaining({ name: 'Cafetera premium' }));
  });

  it('confirms and performs a soft delete', () => {
    create();

    click('delete-button');
    expect(text()).toContain('Confirmar eliminación');
    expect(text()).toContain('¿Seguro que deseas eliminar producto?');

    click('confirm-delete-button');

    expect(fake.remove).toHaveBeenCalledWith('p1');
    expect(toast.toasts().some((item) => item.message === 'Se eliminó producto correctamente.')).toBe(true);
  });

  it('reports a failed delete through a toast', () => {
    fake.remove.and.returnValue(throwError(() => ({ error: { message: 'No permitido' } })));

    create();
    click('delete-button');
    click('confirm-delete-button');

    expect(toast.toasts().some((item) => item.kind === 'error')).toBe(true);
  });

  it('localizes a server field error by its stable code', () => {
    fake.create.and.returnValue(
      throwError(() => ({
        error: {
          statusCode: 422,
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: [
            { field: 'name', code: 'UNSUPPORTED_VALUE', message: 'must be one of: a, b', params: { allowed: ['a', 'b'] } }
          ]
        }
      }))
    );

    create();
    click('create-button');
    page.form.patchValue({ name: 'X', basePrice: 1 });
    page.submit();
    fixture.detectChanges();

    // The code wins over the English API prose.
    expect(text()).toContain('Valor no admitido');
    expect(text()).toContain('a, b');
    expect(text()).not.toContain('must be one of');
  });

  it('surfaces an unmapped API field error verbatim', () => {
    fake.create.and.returnValue(
      throwError(() => ({
        error: { message: 'Invalid input', details: [{ field: 'name', message: 'Requerido' }] }
      }))
    );

    create();
    click('create-button');
    page.form.patchValue({ name: 'X', basePrice: 1 });
    page.submit();
    fixture.detectChanges();

    expect(text()).toContain('Invalid input');
    expect(text()).toContain('Requerido');
  });

  // --- toolbar -------------------------------------------------------------

  it('debounces the search box and reloads with the term', fakeAsync(() => {
    create();
    fake.list.calls.reset();

    page.searchInput.setValue('cafe');
    tick(400);
    fixture.detectChanges();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'cafe', page: 1 }));
  }));

  it('filters by status chip', () => {
    create();
    fake.list.calls.reset();

    fixture.debugElement
      .queryAll(By.css('[data-testid="status-chips"] button'))
      .find((button) => button.nativeElement.textContent.includes('Inactivos'))!
      .nativeElement.click();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'inactive' }));
  });

  it('sorts by a sortable column and toggles the direction', () => {
    create();
    fake.list.calls.reset();

    fixture.debugElement.queryAll(By.css('thead th'))[0].nativeElement.click();
    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ sort: 'name', order: 'asc' }));

    fake.list.calls.reset();
    fixture.debugElement.queryAll(By.css('thead th'))[0].nativeElement.click();
    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ sort: 'name', order: 'desc' }));
  });

  it('paginates to the next page', () => {
    fake.list.and.returnValue(
      of({ data: [{ id: 'p1', name: 'A', basePrice: 1, currencyCode: 'MXN', status: 'active' }], meta: { page: 1, limit: 10, total: 25, totalPages: 3 } })
    );

    create();
    fake.list.calls.reset();

    fixture.debugElement
      .queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Siguiente'))!
      .nativeElement.click();

    expect(fake.list).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2 }));
  });

  it('closes the modal on cancel', () => {
    create();
    click('create-button');

    page.closeModal();
    fixture.detectChanges();

    expect(page.modalOpen()).toBe(false);
  });

  it('exposes the visible fields and row actions helpers', () => {
    create();

    expect(page.visibleFields().length).toBe(2);
    expect(page.visibleRowActions({ id: 'p1' }).length).toBe(1);
  });
});

/**
 * The autocomplete field type, on a host that declares an async source and an
 * `initialOption`. Kept apart from the main host so the existing expectations
 * about its two fields stay untouched.
 */
@Component({
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Precios"
      entityLabel="precio"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [asyncSelectSources]="asyncSelectSources"
      [selectSources]="selectSources"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="true"
      [canEdit]="true"
    />
  `
})
class AutocompleteHostComponent {
  service: CrudResource<any> = new FakeResource() as unknown as CrudResource<any>;
  columns: ColumnConfig[] = [{ key: 'product.name', label: { text: 'Producto' } }];

  asyncCalls: string[] = [];

  fields: FieldConfig[] = [
    {
      key: 'productId',
      label: { text: 'Producto' },
      type: 'autocomplete',
      required: true,
      asyncOptionsKey: 'products',
      placeholder: { text: 'Buscar por SKU o nombre…' },
      disabledOnEdit: true,
      initialOption: (row) =>
        row?.['product']
          ? { value: row['product'].id, label: { text: `${row['product'].sku} — ${row['product'].name}` } }
          : null
    }
  ];

  selectSources = {
    priceLists: jasmine
      .createSpy('priceLists')
      .and.returnValue(of([{ value: 'list-1', label: { text: 'Retail' } }]))
  };

  asyncSelectSources = {
    products: (term: string) => {
      this.asyncCalls.push(term);
      return of([{ value: 'prod-1', label: { text: 'CAFE-1000 — Cafetera' } }]);
    }
  };

  mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    productId: row['productId'] ?? ''
  });

  mapToPayload = (values: Record<string, unknown>, context: { isEditing: boolean }) => {
    const payload = { ...values };
    if (context.isEditing) delete payload['productId'];
    return payload;
  };
}

describe('CrudPageComponent — autocomplete field', () => {
  let fixture: ComponentFixture<AutocompleteHostComponent>;
  let host: AutocompleteHostComponent;
  let page: CrudPageComponent;

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AutocompleteHostComponent, provideTranslocoTesting()]
    }).compileComponents();

    installTestTranslations();
    fixture = TestBed.createComponent(AutocompleteHostComponent);
    host = fixture.componentInstance;
    TestBed.inject(ToastService).clear();
  });

  afterEach(() => {
    fixture.destroy();
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  function create(): void {
    fixture.detectChanges();
    page = fixture.debugElement.query(By.directive(CrudPageComponent)).componentInstance;
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('[data-testid="autocomplete-productId"]') as HTMLInputElement;
  }

  it('renders an autocomplete control instead of a select', () => {
    create();
    page.openCreate();
    fixture.detectChanges();

    const element = input();
    expect(element).toBeTruthy();
    expect(element.getAttribute('role')).toBe('combobox');
    expect(element.placeholder).toBe('Buscar por SKU o nombre…');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('does not query the catalog just by opening the create form', () => {
    create();
    page.openCreate();
    fixture.detectChanges();

    // The old implementation loaded 100 products on init; an async source must
    // stay untouched until the user types.
    expect(host.asyncCalls).toEqual([]);
  });

  it('keeps the eager select sources working alongside async ones', () => {
    create();

    expect(Object.keys(page.options())).toContain('priceLists');
    expect(page.options()['priceLists']).toEqual([{ value: 'list-1', label: { text: 'Retail' } }]);
  });

  it('resolves the initial option from the edited row and disables the field', () => {
    create();
    const row = {
      id: 'price-1',
      productId: 'prod-9',
      product: { id: 'prod-9', sku: 'SKU-9', name: 'Antiguo' }
    };

    page.openEdit(row);
    fixture.detectChanges();

    expect(page.initialOptionFor(host.fields[0])).toEqual({
      value: 'prod-9',
      label: { text: 'SKU-9 — Antiguo' }
    });

    // The control keeps its value even though it cannot be edited.
    expect(page.form.get('productId')?.disabled).toBe(true);
    expect(page.form.get('productId')?.value).toBe('prod-9');
    expect(page.form.getRawValue()['productId']).toBe('prod-9');
    expect(input().value).toBe('SKU-9 — Antiguo');
  });

  it('never submits an edited product reference', () => {
    create();
    page.openEdit({ id: 'price-1', productId: 'prod-9', product: { id: 'prod-9', sku: 'SKU-9', name: 'Antiguo' } });
    fixture.detectChanges();

    page.submit();

    const update = (host.service as unknown as FakeResource).update;
    expect(update).toHaveBeenCalled();
    const payload = update.calls.mostRecent().args[1] as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain('productId');
  });

  it('blocks submission while a required autocomplete has no selection', () => {
    create();
    page.openCreate();
    fixture.detectChanges();

    page.submit();

    expect((host.service as unknown as FakeResource).create).not.toHaveBeenCalled();
    expect(page.form.get('productId')?.invalid).toBe(true);
  });

  it('marks the control dirty and touched when an option is selected', () => {
    create();
    page.openCreate();
    fixture.detectChanges();

    const control = page.form.get('productId');
    expect(control?.dirty).toBe(false);

    page.onAutocompleteSelected(host.fields[0]);

    expect(control?.dirty).toBe(true);
    expect(control?.touched).toBe(true);
  });

  it('clears the option cache and closes the modal when the company changes', () => {
    create();
    page.openCreate();
    fixture.detectChanges();
    expect(page.modalOpen()).toBe(true);
    expect(Object.keys(page.options()).length).toBeGreaterThan(0);

    const loader = host.selectSources.priceLists as jasmine.Spy;
    expect(loader).toHaveBeenCalledTimes(1);

    // A global administrator switching company must not keep the previous
    // company's cached options, nor an open form referencing them.
    TestBed.inject(TenantContextService).select('tenant-2');
    fixture.detectChanges();

    expect(page.modalOpen()).toBe(false);
    expect(page.initialOptions()).toEqual({});
    // The eager sources are re-run, so the options belong to the new company.
    expect(loader).toHaveBeenCalledTimes(2);
    expect(page.options()['priceLists']).toEqual([{ value: 'list-1', label: { text: 'Retail' } }]);
  });
});
