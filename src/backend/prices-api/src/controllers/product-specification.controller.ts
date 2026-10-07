import type { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { toPlain } from '../common/utils/serialize';
import { requireActor, requireTenant } from '../common/crud/controller';
import type { ProductSpecificationService } from '../services/product-specification.service';
import type { ReplaceProductSpecificationInput } from '../validators/product-specification.validators';

/**
 * HTTP layer for the specification aggregate.
 *
 * No business logic lives here: it resolves the tenant and actor from the
 * request context, reads the route's `productId`, and delegates. Tenant
 * resolution is shared with the generic CRUD controller so the aggregate cannot
 * drift from the rest of the API on how a tenant is derived.
 *
 * The route is nested under a product, so the response is the aggregate itself
 * rather than a wrapped envelope — the same shape `GET` returns, which keeps the
 * client's model uniform across all three verbs.
 */
@injectable()
export class ProductSpecificationController {
  constructor(
    @inject(TOKENS.ProductSpecificationService)
    private readonly service: ProductSpecificationService
  ) {}

  private productId(req: Request): string {
    return String(req.params.productId);
  }

  /** 200 with an empty aggregate when nothing has been captured yet. */
  get = asyncHandler(async (req: Request, res: Response) => {
    const aggregate = await this.service.getAggregate(requireTenant(req), this.productId(req));
    res.json(toPlain(aggregate));
  });

  /** Full replacement. Returns the stored aggregate, so the client can resync. */
  replace = asyncHandler(async (req: Request, res: Response) => {
    const aggregate = await this.service.replaceAggregate(
      requireTenant(req),
      this.productId(req),
      req.body as ReplaceProductSpecificationInput,
      requireActor(req)
    );
    res.json(toPlain(aggregate));
  });

  /** Soft-deletes the aggregate and its children; never the product. */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const aggregate = await this.service.removeAggregate(
      requireTenant(req),
      this.productId(req),
      requireActor(req)
    );
    res.json(toPlain(aggregate));
  });
}
