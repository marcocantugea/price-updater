import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { SupplierPickerComponent } from './supplier-picker.component';
import { SupplierService } from '../../core/services/catalog.services';

function page(names: string[]) {
  return {
    data: names.map((name, index) => ({
      id: `s-${index}`,
      tenantId: 'tenant-1',
      name,
      status: 'active'
    })),
    meta: { page: 1, limit: 20, total: names.length, totalPages: 1 }
  };
}

/**
 * The supplier picker must stay usable when the catalog is large, when a filter
 * matches nothing, and when the catalog cannot be loaded at all — three states
 * that used to share one message.
 */
describe('SupplierPickerComponent', () => {
  let fixture: ComponentFixture<SupplierPickerComponent>;
  let component: SupplierPickerComponent;
  let suppliers: { list: jasmine.Spy };

  beforeEach(async () => {
    window.localStorage.clear();
    suppliers = { list: jasmine.createSpy('list').and.returnValue(of(page(['Norte']))) };

    await TestBed.configureTestingModule({
      imports: [SupplierPickerComponent, provideTranslocoTesting()],
      providers: [{ provide: SupplierService, useValue: suppliers }]
    }).compileComponents();

    installTestTranslations();
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  function create(options: { response?: unknown; assigned?: { id: string; name: string | null }[] } = {}) {
    if (options.response) suppliers.list.and.returnValue(options.response);

    fixture = TestBed.createComponent(SupplierPickerComponent);
    if (options.assigned) fixture.componentRef.setInput('assigned', options.assigned);
    fixture.detectChanges();
    component = fixture.componentInstance;
  }

  const text = () => fixture.nativeElement.textContent as string;
  const query = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;

  it('queries the server with the typed term instead of slicing the catalog', fakeAsync(() => {
    create();
    // The initial load proves the catalog is not assumed to be one page.
    expect(suppliers.list).toHaveBeenCalledTimes(1);
    expect(suppliers.list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ status: 'active', limit: 20 })
    );

    component.onFilterChange('nor');
    tick(300);

    // One request after the debounce, carrying the term: a supplier beyond the
    // first page is reachable.
    expect(suppliers.list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ search: 'nor', status: 'active' })
    );
  }));

  it('distinguishes an empty catalog from a filter with no matches', fakeAsync(() => {
    create({ response: of(page([])) });

    expect(query('[data-testid="supplier-picker-empty"]')?.textContent).toContain('Sin proveedores');
    expect(query('[data-testid="supplier-picker-error"]')).toBeNull();

    component.onFilterChange('zzz');
    tick(300);
    fixture.detectChanges();

    expect(query('[data-testid="supplier-picker-empty"]')?.textContent).toContain('Ningún proveedor');
  }));

  it('keeps the assigned chips when the catalog fails and offers a retry', () => {
    create({
      response: throwError(() => ({ status: 500 })),
      assigned: [{ id: 's-old', name: 'Proveedor inactivo' }]
    });

    // The failure is reported, but the existing link is still visible: the user
    // can keep it instead of facing what looks like data loss.
    expect(query('[data-testid="supplier-picker-error"]')).toBeTruthy();
    expect(text()).toContain('Proveedor inactivo');

    suppliers.list.and.returnValue(of(page(['Norte'])));
    query('[data-testid="supplier-picker-retry"]')!.click();
    fixture.detectChanges();

    expect(query('[data-testid="supplier-picker-error"]')).toBeNull();
    expect(text()).toContain('Norte');
    expect(text()).toContain('Proveedor inactivo');
  });

  it('exposes the selection through the control value accessor', () => {
    create();

    component.writeValue(['s-0']);
    expect(component.isSelected('s-0')).toBe(true);

    let emitted: string[] = [];
    component.registerOnChange((value) => (emitted = value));
    component.toggle('s-0');

    expect(component.isSelected('s-0')).toBe(false);
    expect(emitted).toEqual([]);
  });
});
