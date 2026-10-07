import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { toPlain } from '../common/utils/serialize';
import { requireTenant } from '../common/crud/controller';
import type { DashboardService } from '../services/dashboard.service';

@injectable()
export class DashboardController {
  constructor(@inject(TOKENS.DashboardService) private readonly dashboardService: DashboardService) {}

  summary = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.dashboardService.summary(requireTenant(req))));
  });

  recentPrices = asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit ?? 8);
    res.json(toPlain(await this.dashboardService.recentPrices(requireTenant(req), Number.isFinite(limit) ? limit : 8)));
  });

  pricesByMarketplace = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.dashboardService.pricesByMarketplace(requireTenant(req))));
  });
}
