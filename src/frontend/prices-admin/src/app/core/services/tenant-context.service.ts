import { Injectable, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { SessionStore } from './session.store';

/**
 * Owns the "active company" selection for global administrators.
 * Notifies subscribers so tenant-scoped screens reload after a switch.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly session = inject(SessionStore);
  private readonly changesSubject = new Subject<string | null>();

  /** Emits whenever the global administrator switches company. */
  readonly changes: Observable<string | null> = this.changesSubject.asObservable();

  select(tenantId: string | null): void {
    this.session.selectTenant(tenantId);
    this.changesSubject.next(tenantId);
  }
}
