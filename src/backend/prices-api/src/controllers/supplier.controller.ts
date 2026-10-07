import { inject, injectable } from 'tsyringe';
import type { RequestHandler } from 'express';
import { TOKENS } from '../di/tokens';
import { createGlobalCatalogHandlers } from './global-catalog.controller';
import type { SupplierService } from '../services/supplier.service';

/**
 * HTTP surface of the global supplier catalog.
 *
 * Same shape as the unit catalog: the handlers come from the shared factory, so
 * no verb needs a tenant, and the routes decide who may write. A tenant user
 * keeps `suppliers:read` because the specification picker lists the catalog.
 */
@injectable()
export class SupplierController {
  readonly list: RequestHandler;
  readonly get: RequestHandler;
  readonly create: RequestHandler;
  readonly update: RequestHandler;
  readonly remove: RequestHandler;

  constructor(@inject(TOKENS.SupplierService) service: SupplierService) {
    const handlers = createGlobalCatalogHandlers(service);

    this.list = handlers.list;
    this.get = handlers.get;
    this.create = handlers.create;
    this.update = handlers.update;
    this.remove = handlers.remove;
  }
}
