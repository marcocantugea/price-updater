import { Router } from 'express';
import { container } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { createApiKeyAuthMiddleware, requireScope } from '../middlewares/api-key';
import { resolveTenant } from '../middlewares/tenant';
import { createCrudController } from '../common/crud/controller';
import type { ApiKeyService } from '../services/api-key.service';
import type { CrudService } from '../common/crud/service';
import type { CrudController } from '../common/crud/types';

/**
 * External, versioned, read-only API. Authenticated with X-API-Key; the tenant
 * is resolved from the key and each route enforces its read scope.
 */
export function createExternalRouter(): Router {
  const router = Router();

  const apiKeyService = container.resolve<ApiKeyService>(TOKENS.ApiKeyService);
  const guards = [createApiKeyAuthMiddleware(apiKeyService), resolveTenant];

  const controllerFor = (token: string): CrudController =>
    createCrudController(container.resolve<CrudService<any>>(token));

  const products = controllerFor(TOKENS.ProductService);
  const priceLists = controllerFor(TOKENS.PriceListService);
  const prices = controllerFor(TOKENS.PriceService);
  const marketplaces = controllerFor(TOKENS.MarketplaceService);

  router.get('/products', ...guards, requireScope('products:read'), products.list);
  router.get('/products/:id', ...guards, requireScope('products:read'), products.get);

  router.get('/price-lists', ...guards, requireScope('price-lists:read'), priceLists.list);
  router.get('/price-lists/:id', ...guards, requireScope('price-lists:read'), priceLists.get);

  router.get('/prices', ...guards, requireScope('prices:read'), prices.list);
  router.get('/prices/:id', ...guards, requireScope('prices:read'), prices.get);

  router.get('/marketplaces', ...guards, requireScope('marketplaces:read'), marketplaces.list);
  router.get('/marketplaces/:id', ...guards, requireScope('marketplaces:read'), marketplaces.get);

  return router;
}
