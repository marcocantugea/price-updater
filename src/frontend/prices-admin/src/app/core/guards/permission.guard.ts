import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../services/session.store';

/**
 * Route guard factory driven by a permission slug. A global administrator
 * implicitly holds every permission.
 */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const session = inject(SessionStore);
    const router = inject(Router);

    if (session.hasPermission(permission)) return true;
    if (session.hasPermission('price-catalog:read')) return router.createUrlTree(['/price-catalog']);
    return router.createUrlTree(['/dashboard']);
  };
}

/** Restricts a route to global administrators. */
export const globalAdminGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return session.isGlobalAdmin()
    ? true
    : router.createUrlTree(session.hasPermission('price-catalog:read') ? ['/price-catalog'] : ['/dashboard']);
};
