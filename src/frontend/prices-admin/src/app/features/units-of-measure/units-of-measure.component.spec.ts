import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { UnitsOfMeasureComponent } from './units-of-measure.component';
import { UnitOfMeasureService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';

describe('UnitsOfMeasureComponent', () => {
  let fixture: ComponentFixture<UnitsOfMeasureComponent>;
  let component: UnitsOfMeasureComponent;

  async function setup() {
    window.localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [UnitsOfMeasureComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: UnitOfMeasureService,
          useValue: {
            list: jasmine
              .createSpy('list')
              .and.returnValue(of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } })),
            create: jasmine.createSpy('create'),
            update: jasmine.createSpy('update'),
            remove: jasmine.createSpy('remove')
          }
        },
        {
          provide: SessionStore,
          useValue: {
            // A global administrator implicitly holds every permission.
            hasPermission: () => true,
            isGlobalAdmin: () => true,
            activeTenantId: () => null
          }
        }
      ]
    }).compileComponents();

    installTestTranslations();
    fixture = TestBed.createComponent(UnitsOfMeasureComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  }

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('configures every catalog column, dimension included', async () => {
    await setup();

    expect(component.columns.map((column) => column.key)).toEqual([
      'code',
      'name',
      'symbol',
      'dimension',
      'decimals',
      'status'
    ]);
    expect(component.columns[0].sortable).toBe(true);
    expect(component.columns[0].type).toBe('code');
    expect(component.columns[4].align).toBe('right');

    // The stored dimension is a code; the cell shows its translated label.
    const dimension = component.columns[3];
    expect(dimension.value!({ dimension: 'mass' })).toEqual({ key: 'unitDimension.mass' });
  });

  it('locks the code, bounds the text fields and requires a whole number', async () => {
    await setup();

    const code = component.fields.find((field) => field.key === 'code')!;
    expect(code.disabledOnEdit).toBe(true);
    expect(code.maxLength).toBe(8);

    expect(component.fields.find((field) => field.key === 'name')!.maxLength).toBe(100);
    expect(component.fields.find((field) => field.key === 'symbol')!.maxLength).toBe(10);

    const decimals = component.fields.find((field) => field.key === 'decimals')!;
    expect(decimals.type).toBe('number');
    expect(decimals.required).toBe(true);
    expect(decimals.integer).toBe(true);
    expect(decimals.min).toBe(0);
    expect(decimals.max).toBe(3);

    const dimension = component.fields.find((field) => field.key === 'dimension')!;
    expect(dimension.options?.map((option) => option.value)).toEqual(['count', 'mass', 'length']);
  });

  it('omits the immutable code from an update payload', async () => {
    await setup();

    const payload = component.mapToPayload(
      { code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'mass', decimals: 3, status: 'active' },
      { isEditing: true }
    );

    expect(payload['code']).toBeUndefined();
    expect(payload['name']).toBe('Kilogram');

    // Creating does send it, so the code is not lost by the same mapper.
    const created = component.mapToPayload({ code: 'KG', decimals: 3 }, { isEditing: false });
    expect(created['code']).toBe('KG');
  });

  it('never turns a cleared decimals input into zero', async () => {
    await setup();

    // A number input hands `null` when cleared; `Number(null)` is 0, which would
    // silently tighten every future value.
    expect(component.mapToPayload({ decimals: null }, { isEditing: false })['decimals']).toBeUndefined();
    expect(component.mapToPayload({ decimals: '' }, { isEditing: false })['decimals']).toBeUndefined();
    expect(component.mapToPayload({ decimals: 2 }, { isEditing: false })['decimals']).toBe(2);
    // A number input may still deliver the digit as a string.
    expect(component.mapToPayload({ decimals: '2' }, { isEditing: false })['decimals']).toBe(2);
  });

  it('takes its permission flags from the session', async () => {
    await setup();

    expect(component.can('units-of-measure:create')).toBe(true);
    expect(component.can('units-of-measure:update')).toBe(true);
    expect(component.can('units-of-measure:delete')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Unidades de medida');
  });
});
