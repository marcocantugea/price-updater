import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PriceListsComponent } from './price-lists.component';
import { CurrencyService, MarketplaceService, PriceListService } from '../../core/services/catalog.services';
import { ToastService } from '../../core/services/toast.service';

describe('PriceListsComponent marketplace assignment', () => {
  let fixture: ComponentFixture<PriceListsComponent>;
  let component: PriceListsComponent;
  let priceLists: { get: jasmine.Spy; setMarketplaces: jasmine.Spy };

  beforeEach(async () => {
  window.localStorage.clear();
    priceLists = {
      get: jasmine.createSpy('get').and.returnValue(of({
        id: 'list-1',
        name: 'Retail',
        priceListMarketplaces: [{ marketplace: { id: 'marketplace-1', name: 'Amazon' } }]
      })),
      setMarketplaces: jasmine.createSpy('setMarketplaces').and.returnValue(of({ marketplaceIds: [] }))
    };
    await TestBed.configureTestingModule({
      imports: [PriceListsComponent, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: PriceListService, useValue: priceLists },
        { provide: MarketplaceService, useValue: { list: jasmine.createSpy('list').and.returnValue(of({ data: [{ id: 'marketplace-1', name: 'Amazon' }, { id: 'marketplace-2', name: 'Tienda propia' }] })) } },
        { provide: CurrencyService, useValue: { list: jasmine.createSpy('list').and.returnValue(of({ data: [] })) } },
        { provide: ToastService, useValue: { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PriceListsComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads, changes, and saves the marketplaces for a price list', () => {
    component.openMarketplaces({ id: 'list-1', name: 'Retail', status: 'active', tenantId: 'tenant-1' });

    expect(component.selectedMarketplaceIds()).toEqual(new Set(['marketplace-1']));
    component.toggleMarketplace('marketplace-2');
    component.saveMarketplaces();

    expect(priceLists.setMarketplaces).toHaveBeenCalledWith('list-1', ['marketplace-1', 'marketplace-2']);
  });
});
