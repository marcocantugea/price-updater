import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { parseListQuery } from '../common/utils/pagination';
import { toPlain } from '../common/utils/serialize';
import { UnauthorizedError } from '../common/errors';
import { requireActor } from '../common/crud/controller';
import type { TenantService } from '../services/tenant.service';
import type { RequestContext } from '../types';

/**
 * Companies are managed by the global admin, so these handlers deliberately do
 * NOT require a selected tenant context.
 */
@injectable()
export class TenantController {
  constructor(@inject(TOKENS.TenantService) private readonly tenantService: TenantService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.tenantService.list(null, parseListQuery(req.query as Record<string, unknown>));
    res.json(toPlain(result));
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.tenantService.get(null, String(req.params.id))));
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const context = req as RequestContext;
    if (!context.tenantId) throw new UnauthorizedError('No company selected', 'TENANT_REQUIRED');
    res.json(toPlain(await this.tenantService.current(context.tenantId)));
  });

  timeZone = asyncHandler(async (req: Request, res: Response) => {
    const context = req as RequestContext;
    if (!context.tenantId) throw new UnauthorizedError('No company selected', 'TENANT_REQUIRED');
    const tenant = await this.tenantService.current(context.tenantId);
    res.json(toPlain({ timeZone: tenant.timeZone }));
  });

  updateTimeZone = asyncHandler(async (req: Request, res: Response) => {
    const context = req as RequestContext;
    if (!context.tenantId) throw new UnauthorizedError('No company selected', 'TENANT_REQUIRED');
    const tenant = await this.tenantService.updateTimeZone(
      context.tenantId,
      String(req.body.timeZone),
      requireActor(req)
    );
    res.json(toPlain({ timeZone: tenant.timeZone }));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const created = await this.tenantService.create(null, req.body ?? {}, requireActor(req));
    res.status(201).json(toPlain(created));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const updated = await this.tenantService.update(null, String(req.params.id), req.body ?? {}, requireActor(req));
    res.json(toPlain(updated));
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const removed = await this.tenantService.remove(null, String(req.params.id), requireActor(req));
    res.json(toPlain(removed));
  });
}
