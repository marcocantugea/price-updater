import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { asyncHandler } from '../common/utils/async-handler';
import type { AuthUser, RequestContext } from '../types';

const BEARER_PREFIX = 'bearer ';

export function extractBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  if (trimmed.toLowerCase().startsWith(BEARER_PREFIX)) {
    const token = trimmed.slice(BEARER_PREFIX.length).trim();
    return token === '' ? null : token;
  }
  return null;
}

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthUser>;
}

/** Verifies the JWT access token and attaches the resolved user. */
export function createJwtAuthMiddleware(verifier: AccessTokenVerifier): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.header('authorization'));
    if (!token) throw new UnauthorizedError('Missing bearer token');

    const user = await verifier.verifyAccessToken(token);
    const context = req as RequestContext;
    context.user = user;
    context.actor = { id: user.id, type: 'user' };
    context.tenantId = user.tenantId;

    next();
  });
}

/** RBAC guard: requires a permission granted through the user's role. */
export function requirePermission(permission: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as RequestContext).user;
    if (!user) return next(new UnauthorizedError());
    if (user.isGlobalAdmin || user.permissions.includes(permission)) return next();
    return next(new ForbiddenError(`Missing required permission: ${permission}`, 'INSUFFICIENT_PERMISSION'));
  };
}

/** Restricts a route to global administrators only. */
export const requireGlobalAdmin: RequestHandler = (req, _res, next) => {
  const user = (req as RequestContext).user;
  if (!user) return next(new UnauthorizedError());
  if (!user.isGlobalAdmin) {
    return next(new ForbiddenError('Global administrator role required', 'GLOBAL_ADMIN_REQUIRED'));
  }
  next();
};
