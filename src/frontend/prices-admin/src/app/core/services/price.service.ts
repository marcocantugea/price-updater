import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CrudResource } from './crud-resource';
import type { ListQuery, Paginated, Price, PriceCalculation, PriceHistoryEntry } from '../models';

export interface PriceCalculationInput {
  productId: string;
  priceListId: string;
  marketplaceId: string;
  basePrice: number;
  currencyCode: string;
  at?: string;
}

@Injectable({ providedIn: 'root' })
export class PriceService extends CrudResource<Price> {
  constructor(http: HttpClient) {
    super(http, 'prices');
  }

  /** Previews the final price for an unsaved price. */
  calculate(input: PriceCalculationInput) {
    return this.http.post<PriceCalculation>(`${this.baseUrl}/calculate`, input);
  }

  /** Recalculates an existing price. */
  recalculate(id: string, body: Partial<PriceCalculationInput> = {}) {
    return this.http.post<PriceCalculation>(`${this.baseUrl}/${id}/calculate`, body);
  }

  history(id: string, query: ListQuery = {}) {
    return this.http.get<Paginated<PriceHistoryEntry>>(`${this.baseUrl}/${id}/history`, {
      params: this.buildParams(query)
    });
  }
}
