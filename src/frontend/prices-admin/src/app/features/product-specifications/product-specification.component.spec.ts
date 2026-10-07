import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { ProductSpecificationComponent } from './product-specification.component';
import { ProductSpecificationService } from '../../core/services/product-specification.service';
import {
  BrandService,
  SupplierService,
  UnitOfMeasureService
} from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import type { ProductSpecificationAggregate } from '../../core/models';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const BRAND_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
const PRESENTATION_ID = '44444444-4444-4444-8444-444444444444';
const IDENTIFIER_ID = '55555555-5555-4555-8555-555555555555';
const EAN_13 = '7501234567893';

const UNITS = [
  { id: 'u-ea', code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimals: 0, status: 'active' },
  { id: 'u-kg', code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'mass', decimals: 3, status: 'active' },
  { id: 'u-cm', code: 'CM', name: 'Centimeter', symbol: 'cm', dimension: 'length', decimals: 3, status: 'active' }
];

function aggregate(): ProductSpecificationAggregate {
  return {
    product: { id: PRODUCT_ID, sku: 'SKU-1', name: 'Product one' } as any,
    specification: {
      id: 'spec-1',
      brandId: BRAND_ID,
      brandName: 'Acme',
      model: 'ACM-2026',
      measurements: {
        weight: { value: 1.25, unitCode: 'KG' },
        length: { value: 30, unitCode: 'CM' },
        depth: null
      }
    },
    presentations: [
      {
        id: PRESENTATION_ID,
        name: 'Caja de 12',
        quantity: 12,
        unitCode: 'EA',
        identifiers: [
          { id: IDENTIFIER_ID, type: 'ean_13', value: EAN_13, normalizedValue: '07501234567893' }
        ]
      }
    ],
    suppliers: [{ id: SUPPLIER_ID, name: 'Norte' }]
  };
}

function emptyAggregate(): ProductSpecificationAggregate {
  return {
    product: { id: PRODUCT_ID, sku: 'SKU-1', name: 'Product one' } as any,
    specification: null,
    presentations: [],
    suppliers: []
  };
}

describe('ProductSpecificationComponent', () => {
  let fixture: ComponentFixture<ProductSpecificationComponent>;
  let component: ProductSpecificationComponent;
  let specifications: { get: jasmine.Spy; replace: jasmine.Spy; clear: jasmine.Spy };
  let permissions: string[];

  async function setup(options: { get?: any; permissions?: string[] } = {}) {
    permissions = options.permissions ?? ['products:read', 'products:update'];

    specifications = {
      get: jasmine.createSpy('get').and.returnValue(options.get ?? of(aggregate())),
      replace: jasmine.createSpy('replace').and.returnValue(of(aggregate())),
      clear: jasmine.createSpy('clear').and.returnValue(of(emptyAggregate()))
    };

    await TestBed.configureTestingModule({
      imports: [ProductSpecificationComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ productId: PRODUCT_ID }) } }
        },
        { provide: ProductSpecificationService, useValue: specifications },
        {
          provide: UnitOfMeasureService,
          useValue: {
            list: jasmine.createSpy('list').and.returnValue(of({ data: UNITS })),
            // The page requests the complete active catalog, page by page.
            allActive: jasmine.createSpy('allActive').and.returnValue(of(UNITS))
          }
        },
        { provide: BrandService, useValue: { list: jasmine.createSpy('list').and.returnValue(of({ data: [] })) } },
        {
          provide: SupplierService,
          useValue: {
            list: jasmine
              .createSpy('list')
              .and.returnValue(of({ data: [{ id: SUPPLIER_ID, name: 'Norte', tenantId: 't', status: 'active' }] }))
          }
        },
        {
          provide: SessionStore,
          useValue: { hasPermission: jasmine.createSpy('hasPermission').and.callFake((p: string) => permissions.includes(p)) }
        }
      ]
    }).compileComponents();

    installTestTranslations();
    fixture = TestBed.createComponent(ProductSpecificationComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  /** Reads the payload the component would send. */
  function savedPayload(): any {
    expect(specifications.replace).toHaveBeenCalled();
    return specifications.replace.calls.mostRecent().args[1];
  }

  // --- reading -------------------------------------------------------------

  describe('loading', () => {
    it('loads the aggregate for the routed product', async () => {
      await setup();

      expect(specifications.get).toHaveBeenCalledWith(PRODUCT_ID);
      expect(component.aggregate()).toEqual(aggregate());
      expect(component.loading()).toBe(false);
      expect(component.mode()).toBe('view');
    });

    it('renders the stored values in the read-only summary', async () => {
      await setup();
      const text = fixture.nativeElement.textContent;

      expect(text).toContain('Acme');
      expect(text).toContain('ACM-2026');
      expect(text).toContain('1.25 kg');
      expect(text).toContain('30 cm');
      expect(text).toContain('Caja de 12');
      expect(text).toContain(EAN_13);
      expect(text).toContain('Norte');
    });

    it('offers the empty state when nothing is captured', async () => {
      await setup({ get: of(emptyAggregate()) });

      expect(component.aggregate()?.specification).toBeNull();
      // Asserted against the default test locale (`es-419`), which is the locale
      // `installTestTranslations` activates. The empty state is the starting
      // point for a first capture, not a read-only summary of nothing.
      expect(fixture.nativeElement.textContent).toContain('nada capturado');
    });

    it('shows the error state and can retry', async () => {
      await setup({ get: throwError(() => ({ status: 404, error: { code: 'NOT_FOUND' } })) });

      expect(component.loadFailed()).toBe(true);

      specifications.get.and.returnValue(of(aggregate()));
      component.load();
      fixture.detectChanges();

      expect(component.loadFailed()).toBe(false);
      expect(component.aggregate()).toEqual(aggregate());
    });

    it('does not offer editing without products:update', async () => {
      await setup({ permissions: ['products:read'] });

      expect(component.canEdit()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('solo lectura');
      // The Edit button is the only way into the form, and `startEdit` refuses
      // on its own too, so the gate does not depend on the template alone.
      component.startEdit();
      expect(component.mode()).toBe('view');
    });
  });

  // --- editing -------------------------------------------------------------

  describe('editing', () => {
    it('builds the form from the stored aggregate', async () => {
      await setup();
      component.startEdit();

      expect(component.mode()).toBe('edit');

      const raw = component.form.getRawValue();
      expect(raw.brandId).toBe(BRAND_ID);
      expect(raw.model).toBe('ACM-2026');
      expect(raw.measurements.weight).toEqual({ value: 1.25, unitCode: 'KG' });
      expect(raw.measurements.depth).toEqual({ value: null, unitCode: null });
      expect(raw.supplierIds).toEqual([SUPPLIER_ID]);
      expect(component.presentations().length).toBe(1);
      expect(component.presentations().at(0).get('identifiers')?.value).toEqual([
        { id: IDENTIFIER_ID, type: 'ean_13', value: EAN_13 }
      ]);
    });

    it('filters the unit pickers by dimension', async () => {
      await setup();

      expect(component.massUnits().map((unit) => unit.code)).toEqual(['KG']);
      expect(component.lengthUnits().map((unit) => unit.code)).toEqual(['CM']);
      expect(component.countUnits().map((unit) => unit.code)).toEqual(['EA']);
      // Weight must never offer a length unit, and vice versa.
      expect(component.measurementFields()[0].units.map((unit) => unit.code)).toEqual(['KG']);
      expect(component.measurementFields()[1].units.map((unit) => unit.code)).toEqual(['CM']);
      expect(component.measurementFields()[2].units.map((unit) => unit.code)).toEqual(['CM']);
    });

    it('offers a stored unit the catalog no longer lists as a historical option', async () => {
      const stored = aggregate();
      stored.specification!.measurements.length = { value: 30, unitCode: 'IN' };
      await setup({ get: of(stored) });
      component.startEdit();

      const lengthField = component.measurementFields()[1];

      // The active catalog is complemented with the code this very field already
      // stores, so the control is not blank and saving does not drop it.
      expect(lengthField.units.map((unit) => unit.code)).toEqual(['CM', 'IN']);
      expect(lengthField.units[1].historical).toBe(true);
      expect(component.form.getRawValue().measurements.length.unitCode).toBe('IN');

      // Sibling fields that never used the code keep the active catalog only:
      // the API treats that selection as a new assignment.
      expect(component.measurementFields()[2].units.map((unit) => unit.code)).toEqual(['CM']);
    });

    it('adds a historical quantity unit only to the presentation that stores it', async () => {
      const stored = aggregate();
      stored.presentations[0].unitCode = 'BOX';
      await setup({ get: of(stored) });
      component.startEdit();

      expect(component.countUnitsFor(0).map((unit) => unit.code)).toEqual(['EA', 'BOX']);
      expect(component.countUnitsFor(0)[1].historical).toBe(true);

      component.addPresentation();
      expect(component.countUnitsFor(1).map((unit) => unit.code)).toEqual(['EA']);
    });

    it('echoes existing child ids so the replacement targets the stored rows', async () => {
      await setup();
      component.startEdit();
      component.save();

      const payload = savedPayload();

      expect(payload.presentations[0].id).toBe(PRESENTATION_ID);
      expect(payload.presentations[0].identifiers[0].id).toBe(IDENTIFIER_ID);
      expect(payload.brandId).toBe(BRAND_ID);
      expect(payload.supplierIds).toEqual([SUPPLIER_ID]);
    });

    it('maps a cleared number input to null instead of zero', async () => {
      await setup();
      component.startEdit();

      // A cleared number input yields '', and Number('') is 0 — which means
      // "captured as zero", the opposite of "not captured".
      component.form.get('measurements.weight.value')?.setValue('');
      component.form.get('measurements.weight.unitCode')?.setValue(null);
      component.save();

      expect(savedPayload().measurements.weight).toBeNull();
    });

    it('refuses to save a measurement that has only one half', async () => {
      await setup();
      component.startEdit();

      component.form.get('measurements.weight.value')?.setValue('');
      // The unit is left selected, so the pair is broken.
      component.save();

      expect(specifications.replace).not.toHaveBeenCalled();
      expect(component.pairError('weight')).toBe('productSpecification.errors.pair');
    });

    it('de-duplicates supplier ids', async () => {
      await setup();
      component.startEdit();

      component.form.get('supplierIds')?.setValue([SUPPLIER_ID, SUPPLIER_ID]);
      component.save();

      expect(savedPayload().supplierIds).toEqual([SUPPLIER_ID]);
    });

    it('adds and removes presentations through the FormArray', async () => {
      await setup();
      component.startEdit();

      component.addPresentation();
      expect(component.presentations().length).toBe(2);

      // A new presentation starts unnamed, and the name is required, so the form
      // is invalid until the user fills it in — saving here would be a no-op.
      component.save();
      expect(specifications.replace).not.toHaveBeenCalled();

      component.presentations().at(1).get('name')?.setValue('Nueva');

      component.removePresentation(0);
      expect(component.presentations().length).toBe(1);

      component.save();

      const payload = savedPayload();
      expect(payload.presentations.length).toBe(1);
      expect(payload.presentations[0].name).toBe('Nueva');
      // No id: omitting it is exactly what creates a row server-side.
      expect(payload.presentations[0].id).toBeUndefined();
      expect(payload.presentations[0].unitCode).toBe('EA');
    });

    it('normalises an empty model to null', async () => {
      await setup();
      component.startEdit();

      component.form.get('model')?.setValue('   ');
      component.save();

      expect(savedPayload().model).toBeNull();
    });
  });

  // --- server errors -------------------------------------------------------

  describe('server errors', () => {
    it('binds nested field paths, including a repeated index, to the exact controls', async () => {
      await setup();
      component.startEdit();
      component.addPresentation();
      component.presentations().at(1).get('name')?.setValue('Otra');

      specifications.replace.and.returnValue(
        throwError(() => ({
          status: 422,
          error: {
            statusCode: 422,
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: [
              {
                field: 'presentations.0.identifiers.0.value',
                code: 'INVALID_IDENTIFIER_CHECKSUM',
                message: 'bad check digit'
              },
              {
                field: 'presentations.1.name',
                code: 'DUPLICATE_PRESENTATION',
                message: 'duplicate name'
              }
            ]
          }
        }))
      );

      component.save();

      // `FormGroup.get` resolves a dotted path with numeric indices, which is
      // exactly the shape the API sends, so a path inside a repeated child needs
      // no manual traversal of the FormArray.
      expect(component.form.get('presentations.0.identifiers.0.value')?.errors?.['server']).toBeTruthy();
      expect(component.form.get('presentations.1.name')?.errors?.['server']).toBeTruthy();
      // A failed save keeps the user in the editor: leaving would discard their
      // work on top of losing the save.
      expect(component.mode()).toBe('edit');
      expect(component.saveError()).toBeTruthy();
    });

    it('surfaces a barcode conflict on the offending identifier', async () => {
      await setup();
      component.startEdit();

      specifications.replace.and.returnValue(
        throwError(() => ({
          status: 409,
          error: {
            statusCode: 409,
            code: 'IDENTIFIER_ALREADY_EXISTS',
            message: 'Identifier already exists',
            details: [
              {
                field: 'presentations.0.identifiers.0.value',
                code: 'IDENTIFIER_ALREADY_EXISTS',
                message: 'already used in this company'
              }
            ]
          }
        }))
      );

      component.save();

      expect(component.mode()).toBe('edit');
      // The localizer resolves the detail by its stable code, so the message the
      // user sees is the catalog copy and NOT the English fallback the API sent.
      const message = component.form.get('presentations.0.identifiers.0.value')?.errors?.['server'];
      expect(message).toContain('código de barras');
      expect(message).not.toBe('already used in this company');
    });

    it('clears stale server errors on the next attempt', async () => {
      await setup();
      component.startEdit();

      component.form.get('model')?.setErrors({ server: 'stale' });
      component.save();

      // A successful save re-patches the form from the response, so nothing from
      // the previous attempt survives.
      expect(component.mode()).toBe('view');
      expect(component.form.get('model')?.errors).toBeNull();
    });
  });

  // --- saving, clearing, cancelling ----------------------------------------

  describe('saving and clearing', () => {
    it('returns to the summary and re-syncs from the response after a save', async () => {
      await setup();
      component.startEdit();

      const response = aggregate();
      response.presentations[0].name = 'Renamed';
      specifications.replace.and.returnValue(of(response));

      component.save();
      fixture.detectChanges();

      expect(component.mode()).toBe('view');
      expect(component.savedMessage()).toBe('productSpecification.states.saved');
      expect(component.aggregate()?.presentations[0].name).toBe('Renamed');
      expect(fixture.nativeElement.textContent).toContain('Renamed');
    });

    it('discards the edit when cancelled', async () => {
      await setup();
      component.startEdit();

      component.form.get('model')?.setValue('CHANGED');
      component.cancelEdit();

      expect(component.mode()).toBe('view');
      expect(component.form.get('model')?.value).toBe('ACM-2026');
      expect(specifications.replace).not.toHaveBeenCalled();
    });

    it('clears the specification after an inline confirmation', async () => {
      await setup();

      component.confirmClear();
      expect(component.confirmingClear()).toBe(true);

      component.clearSpecification();
      fixture.detectChanges();

      expect(specifications.clear).toHaveBeenCalledWith(PRODUCT_ID);
      expect(component.confirmingClear()).toBe(false);
      expect(component.aggregate()?.specification).toBeNull();
      expect(component.savedMessage()).toBe('productSpecification.states.cleared');
    });

    it('abandons the clear when the confirmation is dismissed', async () => {
      await setup();

      component.confirmClear();
      component.cancelClear();

      expect(component.confirmingClear()).toBe(false);
      expect(specifications.clear).not.toHaveBeenCalled();
    });
  });
});
