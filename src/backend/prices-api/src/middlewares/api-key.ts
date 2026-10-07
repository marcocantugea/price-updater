import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { asyncHandler } from '../common/utils/async-handler';
import { extractApiKeyHeader } from '../common/utils/api-key';
import type { ApiKeyContext, RequestContext } from '../types';

export const API_KEY_HEADER = 'x-api-key';

export interface ApiKeyResolver {
  resolveByRawKey(rawKey: string): Promise<ApiKeyContext>;
}

/**
 * Authenticates the external API via the X-API-Key header and resolves the
 * tenant bound to the key. `expired` and `revoked` keys are rejected.
 */
export function createApiKeyAuthMiddleware(resolver: ApiKeyResolver): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const raw = extractApiKeyHeader(req.header(API_KEY_HEADER));
    if (!raw) throw new UnauthorizedError('X-API-Key header is required', 'API_KEY_REQUIRED');

    const resolved = await resolver.resolveByRawKey(raw);
    const context = req as RequestContext;
    context.apiKey = resolved;
    context.scopes = resolved.scopes;
    context.tenantId = resolved.tenantId;
    context.actor = { id: resolved.id, type: 'api_key' };

    next();
  });
}

/** Requires a scope granted to the API key. */
export function requireScope(scope: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const context = req as RequestContext;
    const scopes = context.scopes ?? context.apiKey?.scopes ?? [];
    if (!scopes.includes(scope)) {
      return next(new ForbiddenError(`Missing required scope: ${scope}`, 'INSUFFICIENT_SCOPE'));
    }
    next();
  };
}
