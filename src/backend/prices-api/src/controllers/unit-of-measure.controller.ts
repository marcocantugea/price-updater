import { inject, injectable } from 'tsyringe';
import type { RequestHandler } from 'express';
import { TOKENS } from '../di/tokens';
import { createGlobalCatalogHandlers } from './global-catalog.controller';
import type { UnitOfMeasureService } from '../services/unit-of-measure.service';

/**
 * HTTP surface of the global unit catalog.
 *
 * The handlers come from the shared global-catalog factory; the class exists so
 * the container can resolve it by token and the routes can declare their guards
 * per verb (reads for any role with `units-of-measure:read`, writes for a global
 * administrator only, on top of the service's own protections).
 */
@injectable()
export class UnitOfMeasureController {
  readonly list: RequestHandler;
  readonly get: RequestHandler;
  readonly create: RequestHandler;
  readonly update: RequestHandler;
  readonly remove: RequestHandler;

  constructor(@inject(TOKENS.UnitOfMeasureService) service: UnitOfMeasureService) {
    const handlers = createGlobalCatalogHandlers(service);

    this.list = handlers.list;
    this.get = handlers.get;
    this.create = handlers.create;
    this.update = handlers.update;
    this.remove = handlers.remove;
  }
}
