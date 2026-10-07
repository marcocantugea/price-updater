import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { toPlain } from '../common/utils/serialize';
import { requireTenant } from '../common/crud/controller';
import { UnauthorizedError } from '../common/errors';
import type { RequestContext } from '../types';
import type { PriceCatalogService } from '../services/price-catalog.service';
import type { PriceListAccessService } from '../services/price-list-access.service';

function requireUser(req: Request) {
  const user = (req as RequestContext).user;
  if (!user) throw new UnauthorizedError();
  return user;
}

@injectable()
export class PriceCatalogController {
  constructor(
    @inject(TOKENS.PriceCatalogService) private readonly catalog: PriceCatalogService,
    @inject(TOKENS.PriceListAccessService) private readonly accessService: PriceListAccessService
  ) {}

  priceLists = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.catalog.priceLists(requireTenant(req), requireUser(req))));
  });

  marketplaces = asyncHandler(async (req: Request, res: Response) => {
    res.json(
      toPlain(await this.catalog.marketplaces(requireTenant(req), requireUser(req), String(req.query.priceListId)))
    );
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = ((req as any).validatedQuery ?? req.query) as any;
    res.json(toPlain(await this.catalog.list(requireTenant(req), requireUser(req), query)));
  });

  access = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.accessService.get(requireTenant(req), String(req.params.id))));
  });

  replaceAccess = asyncHandler(async (req: Request, res: Response) => {
    const user = requireUser(req);
    res.json(
      toPlain(
        await this.accessService.replace(
          requireTenant(req),
          String(req.params.id),
          req.body.priceListIds,
          { id: user.id, type: 'user' }
        )
      )
    );
  });
}
