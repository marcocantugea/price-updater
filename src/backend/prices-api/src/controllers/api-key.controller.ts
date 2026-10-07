import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { parseListQuery } from '../common/utils/pagination';
import { toPlain } from '../common/utils/serialize';
import { paramId, requireActor, requireTenant } from '../common/crud/controller';
import type { ApiKeyService } from '../services/api-key.service';

@injectable()
export class ApiKeyController {
  constructor(@inject(TOKENS.ApiKeyService) private readonly apiKeyService: ApiKeyService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.apiKeyService.list(requireTenant(req), parseListQuery(req.query as Record<string, unknown>));
    res.json(toPlain(result));
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.apiKeyService.get(requireTenant(req), paramId(req))));
  });

  /** The plaintext key is present in this response only. */
  create = asyncHandler(async (req: Request, res: Response) => {
    const created = await this.apiKeyService.create(requireTenant(req), req.body ?? {}, requireActor(req));
    res.status(201).json(toPlain(created));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const updated = await this.apiKeyService.update(requireTenant(req), paramId(req), req.body ?? {}, requireActor(req));
    res.json(toPlain(updated));
  });

  revoke = asyncHandler(async (req: Request, res: Response) => {
    const revoked = await this.apiKeyService.revoke(requireTenant(req), paramId(req), requireActor(req));
    res.json(toPlain(revoked));
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const removed = await this.apiKeyService.remove(requireTenant(req), paramId(req), requireActor(req));
    res.json(toPlain(removed));
  });
}
