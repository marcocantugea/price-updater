import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../common/utils/async-handler';
import { parseListQuery } from '../common/utils/pagination';
import { toPlain } from '../common/utils/serialize';
import { paramId, requireActor } from '../common/crud/controller';
import type { CrudService } from '../common/crud/service';

/** The five HTTP handlers of a global catalog. */
export interface GlobalCatalogHandlers {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

/**
 * Builds the CRUD handlers of a **global** catalog (units of measure, suppliers).
 *
 * Deliberately not the generic CRUD controller: that one resolves a tenant with
 * `requireTenant(req)` for every verb, and a global catalog does not belong to a
 * company — a global administrator must be able to list, create and edit with no
 * company selected. Reads stay available to tenant users, whose specification
 * pickers need them; the route decides who may write.
 *
 * Passing `tenantId: null` down is safe because the model options of these
 * catalogs declare `tenantScoped: false`, so the repository never filters by
 * tenant in the first place.
 */
export function createGlobalCatalogHandlers(service: CrudService<any>): GlobalCatalogHandlers {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = parseListQuery(req.query as Record<string, unknown>);
      res.json(toPlain(await service.list(null, query)));
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      res.json(toPlain(await service.get(null, paramId(req))));
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const created = await service.create(null, req.body ?? {}, requireActor(req));
      res.status(201).json(toPlain(created));
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const updated = await service.update(null, paramId(req), req.body ?? {}, requireActor(req));
      res.json(toPlain(updated));
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      res.json(toPlain(await service.remove(null, paramId(req), requireActor(req))));
    })
  };
}
