import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type {
  ProductSpecificationAggregate,
  ProductSpecificationPayload
} from '../models';

/**
 * HTTP access to the product-specification aggregate.
 *
 * The routes are nested under a product and all three verbs return the **same**
 * aggregate shape, so the page always re-renders from the server's answer
 * instead of patching local state and hoping it matches.
 *
 * `replace` is a full replacement (`PUT`), not a partial update: it is
 * deliberately not named `update`, which in every neighbouring service means a
 * `PATCH` of a single field.
 */
@Injectable({ providedIn: 'root' })
export class ProductSpecificationService {
  private readonly baseUrl = `${environment.apiUrl}/products`;

  constructor(private readonly http: HttpClient) {}

  private url(productId: string): string {
    return `${this.baseUrl}/${productId}/specification`;
  }

  /** 200 with an empty aggregate when the product has nothing captured. */
  get(productId: string) {
    return this.http.get<ProductSpecificationAggregate>(this.url(productId));
  }

  /** Full replacement. Returns the stored aggregate for resynchronisation. */
  replace(productId: string, payload: ProductSpecificationPayload) {
    return this.http.put<ProductSpecificationAggregate>(this.url(productId), payload);
  }

  /** Soft-deletes the aggregate and its children; never the product. */
  clear(productId: string) {
    return this.http.delete<ProductSpecificationAggregate>(this.url(productId));
  }
}
