import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DashboardSummary, MarketplaceChartPoint, Price } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private readonly http: HttpClient) {}

  private get baseUrl(): string {
    return `${environment.apiUrl}/dashboard`;
  }

  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.baseUrl}/summary`);
  }

  recentPrices(limit = 8): Observable<Price[]> {
    return this.http.get<Price[]>(`${this.baseUrl}/recent-prices`, {
      params: new HttpParams().set('limit', String(limit))
    });
  }

  pricesByMarketplace(): Observable<MarketplaceChartPoint[]> {
    return this.http.get<MarketplaceChartPoint[]>(`${this.baseUrl}/prices-by-marketplace`);
  }
}
