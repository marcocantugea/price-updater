import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { paramId, requireActor, requireTenant } from '../common/crud/controller';
import type { PriceListService } from '../services/price-list.service';

@injectable()
export class PriceListController {
  constructor(@inject(TOKENS.PriceListService) private readonly priceListService: PriceListService) {}

  setProducts = asyncHandler(async (req: Request, res: Response) => {
    const ids = (req.body?.ids ?? []) as string[];
    const result = await this.priceListService.setProducts(
      requireTenant(req),
      paramId(req),
      ids,
      requireActor(req)
    );
    res.json({ productIds: result });
  });

  setMarketplaces = asyncHandler(async (req: Request, res: Response) => {
    const ids = (req.body?.ids ?? []) as string[];
    const result = await this.priceListService.setMarketplaces(
      requireTenant(req),
      paramId(req),
      ids,
      requireActor(req)
    );
    res.json({ marketplaceIds: result });
  });
}
