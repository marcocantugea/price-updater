import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { parseListQuery } from '../common/utils/pagination';
import { toPlain } from '../common/utils/serialize';
import { paramId, requireActor, requireTenant } from '../common/crud/controller';
import type { PriceService } from '../services/price.service';
import type { CrudService } from '../common/crud/service';

@injectable()
export class PriceController {
  constructor(
    @inject(TOKENS.PriceService) private readonly priceService: PriceService,
    @inject(TOKENS.PriceHistoryService) private readonly priceHistoryService: CrudService<any>
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.priceService.list(requireTenant(req), parseListQuery(req.query as Record<string, unknown>));
    res.json(toPlain(result));
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.priceService.get(requireTenant(req), paramId(req))));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const created = await this.priceService.create(requireTenant(req), req.body ?? {}, requireActor(req));
    res.status(201).json(toPlain(created));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const updated = await this.priceService.update(requireTenant(req), paramId(req), req.body ?? {}, requireActor(req));
    res.json(toPlain(updated));
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const removed = await this.priceService.remove(requireTenant(req), paramId(req), requireActor(req));
    res.json(toPlain(removed));
  });

  /** Preview the final price for an unsaved price. */
  calculate = asyncHandler(async (req: Request, res: Response) => {
    const preview = await this.priceService.preview(requireTenant(req), req.body ?? {});
    res.json(toPlain(preview));
  });

  /** Recalculate the preview for an existing price. */
  calculateExisting = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = requireTenant(req);
    const existing = await this.priceService.get(tenantId, paramId(req));
    const preview = await this.priceService.preview(tenantId, {
      productId: existing.productId,
      priceListId: existing.priceListId,
      marketplaceId: existing.marketplaceId,
      basePrice: Number(req.body?.basePrice ?? existing.basePrice),
      currencyCode: req.body?.currencyCode ?? existing.currencyCode,
      at: req.body?.at ?? undefined
    });
    res.json(toPlain(preview));
  });

  history = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = requireTenant(req);
    await this.priceService.get(tenantId, paramId(req));
    const query = { ...parseListQuery(req.query as Record<string, unknown>), priceId: paramId(req) };
    res.json(toPlain(await this.priceHistoryService.list(tenantId, query as any)));
  });
}
