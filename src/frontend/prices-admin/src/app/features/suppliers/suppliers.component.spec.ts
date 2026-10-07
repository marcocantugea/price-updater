import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { installTestTranslations, provideTranslocoTesting } from '../../testing';
import { SuppliersComponent } from './suppliers.component';
import { SupplierService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';

const ALL_PERMISSIONS = [
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  'suppliers:delete'
];

describe('SuppliersComponent', () => {
  let fixture: ComponentFixture<SuppliersComponent>;
  let component: SuppliersComponent;

  async function setup(permissions: string[] = ALL_PERMISSIONS) {
    window.localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [SuppliersComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: SupplierService,
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
            hasPermission: (permission: string) => permissions.includes(permission),
            isGlobalAdmin: () => false,
            activeTenantId: () => 'tenant-1'
          }
        }
      ]
    }).compileComponents();

    installTestTranslations();
    fixture = TestBed.createComponent(SuppliersComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  }

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('configures the name and status columns and the two form fields', async () => {
    await setup();

    expect(component.columns.map((column) => column.key)).toEqual(['name', 'status']);
    expect(component.columns[0].sortable).toBe(true);
    expect(component.columns[1].type).toBe('status');

    const name = component.fields.find((field) => field.key === 'name')!;
    expect(name.required).toBe(true);
    // The API rejects a longer name; the form states the same limit up front.
    expect(name.maxLength).toBe(150);

    const status = component.fields.find((field) => field.key === 'status')!;
    expect(status.defaultValue).toBe('active');
    expect(status.options?.map((option) => option.value)).toEqual(['active', 'inactive']);
  });

  it('hides Delete from a role that may not delete', async () => {
    await setup(['suppliers:read', 'suppliers:create', 'suppliers:update']);

    expect(component.can('suppliers:read')).toBe(true);
    expect(component.can('suppliers:create')).toBe(true);
    expect(component.can('suppliers:update')).toBe(true);
    // `tenant_user` holds no delete permission, so the row action never renders.
    expect(component.can('suppliers:delete')).toBe(false);
  });

  it('exposes the delete flag to an administrator', async () => {
    await setup();

    expect(component.can('suppliers:delete')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Proveedores');
  });
});
