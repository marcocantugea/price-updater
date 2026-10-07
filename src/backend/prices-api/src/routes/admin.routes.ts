import { Router } from 'express';
import { container } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { createJwtAuthMiddleware, requireGlobalAdmin, requirePermission } from '../middlewares/auth';
import { requireTenantContext, resolveTenant } from '../middlewares/tenant';
import { validate } from '../middlewares/validate';
import { createCrudController } from '../common/crud/controller';
import { createCrudRouter, createReadOnlyRouter } from '../common/crud/router';
import type { CrudController } from '../common/crud/types';
import type { AuthService } from '../services/auth.service';
import type { RoleController } from '../controllers/role.controller';
import type { PriceListController } from '../controllers/price-list.controller';
import type { ApiKeyController } from '../controllers/api-key.controller';
import type { TenantController } from '../controllers/tenant.controller';
import type { PriceController } from '../controllers/price.controller';
import type { DashboardController } from '../controllers/dashboard.controller';
import type { PriceCatalogController } from '../controllers/price-catalog.controller';
import type { ExportController } from '../controllers/export.controller';
import type { ProductSpecificationController } from '../controllers/product-specification.controller';
import type { UnitOfMeasureController } from '../controllers/unit-of-measure.controller';
import type { SupplierController } from '../controllers/supplier.controller';
import {
  assignPermissionsSchema,
  createApiKeySchema,
  createRoleSchema,
  createTenantSchema,
  createUserSchema,
  updateApiKeySchema,
  updateRoleSchema,
  updateTenantSchema,
  updateTenantTimeZoneSchema,
  updateUserSchema
} from '../validators/access.validators';
import {
  calculatePriceSchema,
  createDiscountSchema,
  createMarketplaceSchema,
  createPriceListSchema,
  createPriceSchema,
  createProductSchema,
  setRelationsSchema,
  updateDiscountSchema,
  updateMarketplaceSchema,
  updatePriceListSchema,
  updatePriceSchema,
  updateProductSchema
} from '../validators/pricing.validators';
import {
  catalogMarketplacesQuerySchema,
  catalogQuerySchema,
  createNamedCatalogSchema,
  exportRequestSchema,
  priceListAccessSchema,
  updateNamedCatalogSchema
} from '../validators/catalog.validators';
import {
  productSpecificationParamsSchema,
  replaceProductSpecificationSchema
} from '../validators/product-specification.validators';
import {
  createUnitOfMeasureSchema,
  updateUnitOfMeasureSchema
} from '../validators/unit-of-measure.validators';

/** Administrative API (JWT + tenant context + RBAC). */
export function createAdminRouter(): Router {
  const router = Router();

  const authService = container.resolve<AuthService>(TOKENS.AuthService);
  const jwtAuth = createJwtAuthMiddleware(authService);
  const guards = [jwtAuth, resolveTenant, requireTenantContext];
  /**
   * Guards for the **global** catalogs (suppliers, units of measure): they are
   * not tenant-scoped, so `requireTenantContext` is deliberately absent. A global
   * administrator must be able to manage them with no company selected, and a
   * tenant user must still be able to read them for the specification pickers.
   * `resolveTenant` stays: it is what rejects an `X-Tenant-Id` sent by a
   * non-global user.
   */
  const catalogGuards = [jwtAuth, resolveTenant];
  const priceCatalogController = container.resolve<PriceCatalogController>(TOKENS.PriceCatalogController);
  const exportController = container.resolve<ExportController>(TOKENS.ExportController);

  const crud = (token: string): CrudController =>
    createCrudController(container.resolve<any>(token));

  // --- Companies / tenants (global admin) ---------------------------------
  const tenantController = container.resolve<TenantController>(TOKENS.TenantController);
  const tenantRouter = Router();
  tenantRouter.get('/me', jwtAuth, resolveTenant, requireTenantContext, tenantController.me);
  tenantRouter.get(
    '/me/time-zone',
    jwtAuth,
    resolveTenant,
    requireTenantContext,
    requirePermission('settings:read'),
    tenantController.timeZone
  );
  tenantRouter.patch(
    '/me/time-zone',
    jwtAuth,
    resolveTenant,
    requireTenantContext,
    requirePermission('settings:update'),
    validate(updateTenantTimeZoneSchema),
    tenantController.updateTimeZone
  );
  tenantRouter.get('/', jwtAuth, requireGlobalAdmin, requirePermission('tenants:read'), tenantController.list);
  tenantRouter.get('/:id', jwtAuth, requireGlobalAdmin, requirePermission('tenants:read'), tenantController.get);
  tenantRouter.post(
    '/',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:create'),
    validate(createTenantSchema),
    tenantController.create
  );
  tenantRouter.patch(
    '/:id',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:update'),
    validate(updateTenantSchema),
    tenantController.update
  );
  tenantRouter.delete(
    '/:id',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:delete'),
    tenantController.remove
  );
  router.use('/tenants', tenantRouter);

  // --- Users ---------------------------------------------------------------
  router.use(
    '/users',
    createCrudRouter({
      controller: crud(TOKENS.UserService),
      guards,
      permissions: {
        read: 'users:read',
        create: 'users:create',
        update: 'users:update',
        delete: 'users:delete'
      },
      createValidators: [validate(createUserSchema)],
      updateValidators: [validate(updateUserSchema)]
    })
  );

  router.get(
    '/users/:id/price-list-access',
    ...guards,
    requirePermission('price-list-access:read'),
    priceCatalogController.access
  );
  router.put(
    '/users/:id/price-list-access',
    ...guards,
    requirePermission('price-list-access:manage'),
    validate(priceListAccessSchema),
    priceCatalogController.replaceAccess
  );

  router.get(
    '/price-catalog/price-lists',
    ...guards,
    requirePermission('price-catalog:read'),
    priceCatalogController.priceLists
  );
  router.get(
    '/price-catalog/marketplaces',
    ...guards,
    requirePermission('price-catalog:read'),
    validate(catalogMarketplacesQuerySchema, 'query'),
    priceCatalogController.marketplaces
  );
  router.get(
    '/price-catalog',
    ...guards,
    requirePermission('price-catalog:read'),
    validate(catalogQuerySchema, 'query'),
    priceCatalogController.list
  );
  router.post(
    '/price-catalog/exports',
    ...guards,
    requirePermission('price-catalog:export'),
    validate(exportRequestSchema),
    exportController.create
  );
  router.get(
    '/price-catalog/exports',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.list
  );
  router.get(
    '/price-catalog/exports/:id',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.get
  );
  router.get(
    '/price-catalog/exports/:id/download',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.download
  );

  // --- Roles (+ permissions assignment) ------------------------------------
  const roleController = container.resolve<RoleController>(TOKENS.RoleController);
  const rolesRouter = createCrudRouter({
    controller: crud(TOKENS.RoleService),
    guards,
    permissions: {
      read: 'roles:read',
      create: 'roles:create',
      update: 'roles:update',
      delete: 'roles:delete'
    },
    createValidators: [validate(createRoleSchema)],
    updateValidators: [validate(updateRoleSchema)]
  });
  rolesRouter.get('/:id/permissions', ...guards, requirePermission('roles:read'), roleController.permissions);
  rolesRouter.put(
    '/:id/permissions',
    ...guards,
    requirePermission('roles:assign-permissions'),
    validate(assignPermissionsSchema),
    roleController.assignPermissions
  );
  router.use('/roles', rolesRouter);

  // --- Read-only catalogs --------------------------------------------------
  router.use(
    '/permissions',
    createReadOnlyRouter({
      controller: crud(TOKENS.PermissionService),
      guards,
      readPermission: 'permissions:read'
    })
  );

  router.use(
    '/currencies',
    createReadOnlyRouter({
      controller: crud(TOKENS.CurrencyService),
      guards,
      readPermission: 'currencies:read'
    })
  );

  router.use(
    '/price-history',
    createReadOnlyRouter({
      controller: crud(TOKENS.PriceHistoryService),
      guards,
      readPermission: 'price-history:read'
    })
  );

  // --- Product-specification catalogs --------------------------------------
  // Brands are a flat, tenant-scoped catalog, so they reuse the generic CRUD
  // stack. Suppliers and units of measure are **global** catalogs, mounted with
  // dedicated handlers further below.
  router.use(
    '/brands',
    createCrudRouter({
      controller: crud(TOKENS.BrandService),
      guards,
      permissions: {
        read: 'brands:read',
        create: 'brands:create',
        update: 'brands:update',
        delete: 'brands:delete'
      },
      createValidators: [validate(createNamedCatalogSchema)],
      updateValidators: [validate(updateNamedCatalogSchema)]
    })
  );

  // --- Global supplier catalog (TEC-42) ------------------------------------
  // A supplier is a commercial counterpart every company can use, so the catalog
  // has no tenant: reads are open to any role with `suppliers:read` (the
  // specification picker lists them) and writes are global-administrator only.
  // `resolveTenant` is still applied — it rejects an `X-Tenant-Id` sent by a
  // non-global user — but `requireTenantContext` is not.
  const supplierController = container.resolve<SupplierController>(TOKENS.SupplierController);

  router.get(
    '/suppliers',
    ...catalogGuards,
    requirePermission('suppliers:read'),
    supplierController.list
  );
  router.get(
    '/suppliers/:id',
    ...catalogGuards,
    requirePermission('suppliers:read'),
    supplierController.get
  );
  router.post(
    '/suppliers',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('suppliers:create'),
    validate(createNamedCatalogSchema),
    supplierController.create
  );
  router.patch(
    '/suppliers/:id',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('suppliers:update'),
    validate(updateNamedCatalogSchema),
    supplierController.update
  );
  router.delete(
    '/suppliers/:id',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('suppliers:delete'),
    supplierController.remove
  );

  // --- Global unit catalog (TEC-43) ----------------------------------------
  // Reads stay tenant-agnostic on purpose: a tenant user needs them to fill the
  // specification pickers, and a global administrator needs them with no company
  // selected at all. `resolveTenant` is still applied — it is what rejects an
  // `X-Tenant-Id` sent by a non-global user — but `requireTenantContext` is not,
  // because this catalog does not belong to a company.
  //
  // Writes are global-only twice over: `requireGlobalAdmin` plus the slug, and
  // the service's own immutability, dimension and decimals protections.
  //
  // Route precedence note: these handlers must be mounted once, not split into a
  // "global" router and a "tenant" one. Express dispatches to the first matching
  // path, so a global-only handler registered first would answer 403 to tenant
  // users instead of letting them read the catalog.
  const unitOfMeasureController = container.resolve<UnitOfMeasureController>(
    TOKENS.UnitOfMeasureController
  );
  router.get(
    '/units-of-measure',
    ...catalogGuards,
    requirePermission('units-of-measure:read'),
    unitOfMeasureController.list
  );
  router.get(
    '/units-of-measure/:id',
    ...catalogGuards,
    requirePermission('units-of-measure:read'),
    unitOfMeasureController.get
  );
  router.post(
    '/units-of-measure',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('units-of-measure:create'),
    validate(createUnitOfMeasureSchema),
    unitOfMeasureController.create
  );
  router.patch(
    '/units-of-measure/:id',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('units-of-measure:update'),
    validate(updateUnitOfMeasureSchema),
    unitOfMeasureController.update
  );
  router.delete(
    '/units-of-measure/:id',
    ...catalogGuards,
    requireGlobalAdmin,
    requirePermission('units-of-measure:delete'),
    unitOfMeasureController.remove
  );

  // --- Product specifications (nested aggregate) ---------------------------
  // Registered before the generic `/products` router below. That router has no
  // catch-all, so a two-segment path could not be swallowed by its `/:id`
  // handler anyway; ordering the deeper route first keeps the intent obvious and
  // stays correct if that router ever grows one.
  //
  // Read and write are both Product permissions: the specification has no
  // permissions of its own, which is what makes an existing role keep working
  // without a role update.
  const productSpecificationController = container.resolve<ProductSpecificationController>(
    TOKENS.ProductSpecificationController
  );
  const specificationPath = '/products/:productId/specification';

  router.get(
    specificationPath,
    ...guards,
    validate(productSpecificationParamsSchema, 'params'),
    requirePermission('products:read'),
    productSpecificationController.get
  );

  router.put(
    specificationPath,
    ...guards,
    validate(productSpecificationParamsSchema, 'params'),
    requirePermission('products:update'),
    validate(replaceProductSpecificationSchema),
    productSpecificationController.replace
  );

  router.delete(
    specificationPath,
    ...guards,
    validate(productSpecificationParamsSchema, 'params'),
    requirePermission('products:update'),
    productSpecificationController.remove
  );

  // --- Products ------------------------------------------------------------
  router.use(
    '/products',
    createCrudRouter({
      controller: crud(TOKENS.ProductService),
      guards,
      permissions: {
        read: 'products:read',
        create: 'products:create',
        update: 'products:update',
        delete: 'products:delete'
      },
      createValidators: [validate(createProductSchema)],
      updateValidators: [validate(updateProductSchema)]
    })
  );

  // --- Marketplaces --------------------------------------------------------
  router.use(
    '/marketplaces',
    createCrudRouter({
      controller: crud(TOKENS.MarketplaceService),
      guards,
      permissions: {
        read: 'marketplaces:read',
        create: 'marketplaces:create',
        update: 'marketplaces:update',
        delete: 'marketplaces:delete'
      },
      createValidators: [validate(createMarketplaceSchema)],
      updateValidators: [validate(updateMarketplaceSchema)]
    })
  );

  // --- Price lists (+ product/marketplace relations) -----------------------
  const priceListController = container.resolve<PriceListController>(TOKENS.PriceListController);
  const priceListsRouter = createCrudRouter({
    controller: crud(TOKENS.PriceListService),
    guards,
    permissions: {
      read: 'price-lists:read',
      create: 'price-lists:create',
      update: 'price-lists:update',
      delete: 'price-lists:delete'
    },
    createValidators: [validate(createPriceListSchema)],
    updateValidators: [validate(updatePriceListSchema)]
  });
  priceListsRouter.put(
    '/:id/products',
    ...guards,
    requirePermission('price-lists:update'),
    validate(setRelationsSchema),
    priceListController.setProducts
  );
  priceListsRouter.put(
    '/:id/marketplaces',
    ...guards,
    requirePermission('price-lists:update'),
    validate(setRelationsSchema),
    priceListController.setMarketplaces
  );
  router.use('/price-lists', priceListsRouter);

  // --- Prices (+ calculate + history) --------------------------------------
  const priceController = container.resolve<PriceController>(TOKENS.PriceController);
  const pricesRouter = Router();
  pricesRouter.get('/', ...guards, requirePermission('prices:read'), priceController.list);
  pricesRouter.post(
    '/calculate',
    ...guards,
    requirePermission('prices:calculate'),
    validate(calculatePriceSchema),
    priceController.calculate
  );
  pricesRouter.get('/:id', ...guards, requirePermission('prices:read'), priceController.get);
  pricesRouter.get('/:id/history', ...guards, requirePermission('prices:read'), priceController.history);
  pricesRouter.post(
    '/:id/calculate',
    ...guards,
    requirePermission('prices:calculate'),
    priceController.calculateExisting
  );
  pricesRouter.post(
    '/',
    ...guards,
    requirePermission('prices:create'),
    validate(createPriceSchema),
    priceController.create
  );
  pricesRouter.patch(
    '/:id',
    ...guards,
    requirePermission('prices:update'),
    validate(updatePriceSchema),
    priceController.update
  );
  pricesRouter.delete('/:id', ...guards, requirePermission('prices:delete'), priceController.remove);
  router.use('/prices', pricesRouter);

  // --- Discounts -----------------------------------------------------------
  router.use(
    '/discounts',
    createCrudRouter({
      controller: crud(TOKENS.DiscountService),
      guards,
      permissions: {
        read: 'discounts:read',
        create: 'discounts:create',
        update: 'discounts:update',
        delete: 'discounts:delete'
      },
      createValidators: [validate(createDiscountSchema)],
      updateValidators: [validate(updateDiscountSchema)]
    })
  );

  // --- API keys ------------------------------------------------------------
  const apiKeyController = container.resolve<ApiKeyController>(TOKENS.ApiKeyController);
  const apiKeysRouter = Router();
  apiKeysRouter.get('/', ...guards, requirePermission('api-keys:read'), apiKeyController.list);
  apiKeysRouter.post(
    '/',
    ...guards,
    requirePermission('api-keys:create'),
    validate(createApiKeySchema),
    apiKeyController.create
  );
  apiKeysRouter.get('/:id', ...guards, requirePermission('api-keys:read'), apiKeyController.get);
  apiKeysRouter.patch(
    '/:id',
    ...guards,
    requirePermission('api-keys:update'),
    validate(updateApiKeySchema),
    apiKeyController.update
  );
  apiKeysRouter.post('/:id/revoke', ...guards, requirePermission('api-keys:revoke'), apiKeyController.revoke);
  apiKeysRouter.delete('/:id', ...guards, requirePermission('api-keys:delete'), apiKeyController.remove);
  router.use('/api-keys', apiKeysRouter);

  // --- Dashboard -----------------------------------------------------------
  const dashboardController = container.resolve<DashboardController>(TOKENS.DashboardController);
  router.get('/dashboard/summary', ...guards, requirePermission('dashboard:read'), dashboardController.summary);
  router.get(
    '/dashboard/recent-prices',
    ...guards,
    requirePermission('dashboard:read'),
    dashboardController.recentPrices
  );
  router.get(
    '/dashboard/prices-by-marketplace',
    ...guards,
    requirePermission('dashboard:read'),
    dashboardController.pricesByMarketplace
  );

  return router;
}
