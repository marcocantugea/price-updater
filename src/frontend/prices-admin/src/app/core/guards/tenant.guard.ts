import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../services/session.store';

/**
 * Ensures a company is selected before reaching a tenant-scoped module.
 * Only the global administrator can be in a "no company selected" state;
 * other users always carry a tenant in their token.
 */
export const tenantGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (!session.isGlobalAdmin()) return true;
  if (session.activeTenantId()) return true;

  return router.createUrlTree(['/companies']);
};
