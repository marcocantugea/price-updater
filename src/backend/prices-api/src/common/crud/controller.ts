import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { parseListQuery } from '../utils/pagination';
import { toPlain } from '../utils/serialize';
import { UnauthorizedError } from '../errors';
import type { ActorContext, RequestContext } from '../../types';
import type { CrudService } from './service';
import type { CrudController } from './types';

/** Resolves the tenant resolved by the tenant middleware. */
export function requireTenant(req: Request): string {
  const tenantId = (req as RequestContext).tenantId;
  if (!tenantId) throw new UnauthorizedError('Tenant context is required');
  return tenantId;
}

/** Actor used for audit columns (user or api_key). */
export function requireActor(req: Request): ActorContext {
  const context = req as RequestContext;
  if (context.actor) return context.actor;
  if (context.user) return { id: context.user.id, type: 'user' };
  if (context.apiKey) return { id: context.apiKey.id, type: 'api_key' };
  return { id: null, type: 'system' };
}

export function paramId(req: Request): string {
  return String(req.params.id);
}

/**
 * Builds the five HTTP handlers for a CRUD resource. Controllers contain no
 * business logic — they validate/normalize and delegate to the service.
 */
export function createCrudController<T>(service: CrudService<T>): CrudController {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = parseListQuery(req.query as Record<string, unknown>);
      const result = await service.list(requireTenant(req), query);
      res.json(toPlain(result));
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const entity = await service.get(requireTenant(req), paramId(req));
      res.json(toPlain(entity));
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const created = await service.create(requireTenant(req), req.body ?? {}, requireActor(req));
      res.status(201).json(toPlain(created));
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const updated = await service.update(requireTenant(req), paramId(req), req.body ?? {}, requireActor(req));
      res.json(toPlain(updated));
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const removed = await service.remove(requireTenant(req), paramId(req), requireActor(req));
      res.json(toPlain(removed));
    })
  };
}
