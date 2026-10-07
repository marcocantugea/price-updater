import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { RequestContext } from '../types';

export const TENANT_HEADER = 'x-tenant-id';

/**
 * Resolves the tenant for the request:
 *   1. API key  -> tenant bound to the key (external API)
 *   2. global admin -> X-Tenant-Id header (selected company)
 *   3. non-global user -> tenant from the JWT only
 *
 * A non-global user sending X-Tenant-Id is rejected with 403.
 */
export function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
  const context = req as RequestContext;
  const headerValue = req.header(TENANT_HEADER);
  const headerTenant = headerValue && headerValue.trim() !== '' ? headerValue.trim() : null;

  if (context.apiKey) {
    context.tenantId = context.apiKey.tenantId;
    return next();
  }

  if (!context.user) {
    return next(new UnauthorizedError());
  }

  if (context.user.isGlobalAdmin) {
    context.tenantId = headerTenant ?? context.user.tenantId;
    return next();
  }

  if (headerTenant) {
    return next(
      new ForbiddenError(
        'X-Tenant-Id is only allowed for global administrators',
        'TENANT_HEADER_NOT_ALLOWED'
      )
    );
  }

  context.tenantId = context.user.tenantId;
  next();
}

/** Guard for endpoints that require a selected tenant (admin CRUD). */
export function requireTenantContext(req: Request, _res: Response, next: NextFunction): void {
  const context = req as RequestContext;
  if (!context.tenantId) {
    return next(new UnauthorizedError('A tenant context is required for this operation', 'TENANT_REQUIRED'));
  }
  next();
}

export const tenantMiddlewares: RequestHandler[] = [resolveTenant, requireTenantContext];
