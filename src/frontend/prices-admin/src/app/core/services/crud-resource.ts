import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ListQuery, Paginated } from '../models';

/**
 * Base class for the entity services. Keeps HTTP concerns in one place so the
 * feature pages only deal with their configuration.
 */
export abstract class CrudResource<T> {
  protected constructor(
    protected readonly http: HttpClient,
    protected readonly resourcePath: string
  ) {}

  protected get baseUrl(): string {
    return `${environment.apiUrl}/${this.resourcePath}`;
  }

  protected buildParams(query: ListQuery): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  list(query: ListQuery = {}): Observable<Paginated<T>> {
    return this.http.get<Paginated<T>>(this.baseUrl, { params: this.buildParams(query) });
  }

  get(id: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${id}`);
  }

  create(body: Partial<T> | Record<string, unknown>): Observable<T> {
    return this.http.post<T>(this.baseUrl, body);
  }

  update(id: string, body: Partial<T> | Record<string, unknown>): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}/${id}`, body);
  }

  remove(id: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}/${id}`);
  }
}
