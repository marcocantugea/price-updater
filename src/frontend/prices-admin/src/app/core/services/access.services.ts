import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CrudResource } from './crud-resource';
import type { PriceListAccess, Role, Tenant, User } from '../models';

/** Companies (tenants). Only the global admin can create/update/delete. */
@Injectable({ providedIn: 'root' })
export class TenantService extends CrudResource<Tenant> {
  constructor(http: HttpClient) {
    super(http, 'tenants');
  }

  /** The company the current user operates on. */
  me() {
    return this.http.get<Tenant>(`${this.baseUrl}/me`);
  }

  timeZone() {
    return this.http.get<{ timeZone: string }>(`${this.baseUrl}/me/time-zone`);
  }

  updateTimeZone(timeZone: string) {
    return this.http.patch<{ timeZone: string }>(`${this.baseUrl}/me/time-zone`, { timeZone });
  }
}

@Injectable({ providedIn: 'root' })
export class UserService extends CrudResource<User> {
  constructor(http: HttpClient) {
    super(http, 'users');
  }

  priceListAccess(id: string) {
    return this.http.get<PriceListAccess>(`${this.baseUrl}/${id}/price-list-access`);
  }

  assignPriceLists(id: string, priceListIds: string[]) {
    return this.http.put<PriceListAccess>(`${this.baseUrl}/${id}/price-list-access`, { priceListIds });
  }
}

@Injectable({ providedIn: 'root' })
export class RoleService extends CrudResource<Role> {
  constructor(http: HttpClient) {
    super(http, 'roles');
  }

  permissions(id: string) {
    return this.http.get<{ permissionSlugs: string[] }>(`${this.baseUrl}/${id}/permissions`);
  }

  assignPermissions(id: string, permissionSlugs: string[]) {
    return this.http.put<{ permissionSlugs: string[] }>(`${this.baseUrl}/${id}/permissions`, {
      permissionSlugs
    });
  }
}

/** Integration keys used by the external read-only API. */
@Injectable({ providedIn: 'root' })
export class ApiKeyService extends CrudResource<any> {
  constructor(http: HttpClient) {
    super(http, 'api-keys');
  }

  /** The plaintext key is present only in this response. */
  override create(body: Record<string, unknown>) {
    return this.http.post<any>(this.baseUrl, body);
  }

  revoke(id: string) {
    return this.http.post<any>(`${this.baseUrl}/${id}/revoke`, {});
  }
}
