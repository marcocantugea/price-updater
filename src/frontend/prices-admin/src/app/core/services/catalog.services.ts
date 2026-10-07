import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { CrudResource } from './crud-resource';
import { environment } from '../../../environments/environment';
import type {
  Brand,
  Currency,
  Discount,
  Marketplace,
  Permission,
  PriceHistoryEntry,
  PriceList,
  Product,
  Supplier,
  UnitOfMeasure
} from '../models';
import type { CatalogRow, ExportRequest, ListQuery, Paginated } from '../models';

@Injectable({ providedIn: 'root' })
export class ProductService extends CrudResource<Product> {
  constructor(http: HttpClient) {
    super(http, 'products');
  }
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService extends CrudResource<Marketplace> {
  constructor(http: HttpClient) {
    super(http, 'marketplaces');
  }
}

@Injectable({ providedIn: 'root' })
export class PriceListService extends CrudResource<PriceList> {
  constructor(http: HttpClient) {
    super(http, 'price-lists');
  }

  /** Replaces the product links of a price list. */
  setProducts(id: string, ids: string[]) {
    return this.http.put<{ productIds: string[] }>(`${this.baseUrl}/${id}/products`, { ids });
  }

  /** Replaces the marketplace links of a price list. */
  setMarketplaces(id: string, ids: string[]) {
    return this.http.put<{ marketplaceIds: string[] }>(`${this.baseUrl}/${id}/marketplaces`, { ids });
  }
}

@Injectable({ providedIn: 'root' })
export class DiscountService extends CrudResource<Discount> {
  constructor(http: HttpClient) {
    super(http, 'discounts');
  }
}

/** Price history is append-only: the API only exposes read endpoints. */
@Injectable({ providedIn: 'root' })
export class PriceHistoryService extends CrudResource<PriceHistoryEntry> {
  constructor(http: HttpClient) {
    super(http, 'price-history');
  }
}

/** Currencies are read-only in phase 1. */
@Injectable({ providedIn: 'root' })
export class CurrencyService extends CrudResource<Currency> {
  constructor(http: HttpClient) {
    super(http, 'currencies');
  }

  byCode(code: string) {
    return this.http.get<Currency>(`${this.baseUrl}/${code}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PermissionService extends CrudResource<Permission> {
  constructor(http: HttpClient) {
    super(http, 'permissions');
  }
}

/** Tenant brands. Flat catalogs, so the generic CRUD resource is enough. */
@Injectable({ providedIn: 'root' })
export class BrandService extends CrudResource<Brand> {
  constructor(http: HttpClient) {
    super(http, 'brands');
  }
}

@Injectable({ providedIn: 'root' })
export class SupplierService extends CrudResource<Supplier> {
  constructor(http: HttpClient) {
    super(http, 'suppliers');
  }
}

/**
 * Global unit catalog, administrable by global administrators.
 *
 * `byDimension` and `allActive` back the measurement and quantity pickers: the
 * API rejects a unit whose dimension does not match the field, and refuses a
 * unit that is inactive or deleted for a *new* assignment, so the UI only ever
 * offers valid choices instead of letting the user discover that on save. A unit
 * created by an administrator therefore becomes selectable without a deployment.
 */
@Injectable({ providedIn: 'root' })
export class UnitOfMeasureService extends CrudResource<UnitOfMeasure> {
  constructor(http: HttpClient) {
    super(http, 'units-of-measure');
  }

  byDimension(dimension: string) {
    return this.list({ dimension, status: 'active', limit: 100 });
  }

  /**
   * Every active unit, page by page.
   *
   * The catalog is global and small, but it is administrable at runtime and the
   * generic list caps a page at 100 rows: following the pages is what keeps the
   * pickers complete instead of silently truncating the catalog at one page.
   */
  allActive(): Observable<UnitOfMeasure[]> {
    const fetchPage = (page: number) =>
      this.list({ status: 'active', limit: 100, page, sort: 'code', order: 'asc' });

    return fetchPage(1).pipe(
      expand((response) =>
        response.meta && response.meta.page < response.meta.totalPages
          ? fetchPage(response.meta.page + 1)
          : EMPTY
      ),
      map((response) => response.data),
      reduce((all, page) => [...all, ...page], [] as UnitOfMeasure[])
    );
  }
}

@Injectable({ providedIn: 'root' })
export class PriceCatalogService {
  private readonly baseUrl = `${environment.apiUrl}/price-catalog`;

  constructor(private readonly http: HttpClient) {}

  priceLists() {
    return this.http.get<PriceList[]>(`${this.baseUrl}/price-lists`);
  }

  marketplaces(priceListId: string) {
    return this.http.get<Marketplace[]>(`${this.baseUrl}/marketplaces`, {
      params: { priceListId }
    });
  }

  list(query: ListQuery & { priceListId: string; marketplaceId: string }) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Paginated<CatalogRow>>(this.baseUrl, { params });
  }

  requestExport(input: { priceListId: string; marketplaceId: string; format: 'csv' | 'json' | 'txt'; search?: string }) {
    return this.http.post<ExportRequest>(`${this.baseUrl}/exports`, input);
  }

  exports() {
    return this.http.get<ExportRequest[]>(`${this.baseUrl}/exports`);
  }

  downloadExport(id: string) {
    return this.http.get(`${this.baseUrl}/exports/${id}/download`, { responseType: 'blob', observe: 'response' });
  }
}
