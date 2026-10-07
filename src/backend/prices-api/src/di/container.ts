import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { TOKENS } from './tokens';
import { MODEL_OPTIONS } from '../repositories/model-options';
import { TenantCrudRepository } from '../common/crud/repository';
import { RoleRepository } from '../repositories/role.repository';
import { PrismaAuthRepository } from '../repositories/auth.repository';
import { CrudService } from '../common/crud/service';

import { AuthService } from '../services/auth.service';
import { TenantService } from '../services/tenant.service';
import { UserService } from '../services/user.service';
import { RoleService } from '../services/role.service';
import { ApiKeyService } from '../services/api-key.service';
import { PriceService } from '../services/price.service';
import { PriceListService } from '../services/price-list.service';
import { DiscountService } from '../services/discount.service';
import { DashboardService } from '../services/dashboard.service';
import { PriceListAccessService } from '../services/price-list-access.service';
import { PriceCatalogService } from '../services/price-catalog.service';
import { ProductSpecificationService } from '../services/product-specification.service';
import { SupplierService } from '../services/supplier.service';
import { UnitOfMeasureService } from '../services/unit-of-measure.service';

import { AuthController } from '../controllers/auth.controller';
import { TenantController } from '../controllers/tenant.controller';
import { ApiKeyController } from '../controllers/api-key.controller';
import { PriceController } from '../controllers/price.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { RoleController } from '../controllers/role.controller';
import { PriceListController } from '../controllers/price-list.controller';
import { PriceCatalogController } from '../controllers/price-catalog.controller';
import { ExportController } from '../controllers/export.controller';
import { ProductSpecificationController } from '../controllers/product-specification.controller';
import { UnitOfMeasureController } from '../controllers/unit-of-measure.controller';
import { SupplierController } from '../controllers/supplier.controller';
import { ExportService } from '../services/export.service';
import { LocalExportStorage } from '../services/export.storage';

/**
 * Composition root. Repositories and generic services are registered as
 * instances; services/controllers are resolved by tsyringe through the
 * constructor tokens declared with @inject.
 */
export function buildContainer(prisma: PrismaClient = new PrismaClient()): DependencyContainer {
  const generic = (key: string) => new TenantCrudRepository(prisma, MODEL_OPTIONS[key]);

  container.registerInstance(TOKENS.Prisma, prisma);

  // --- Repositories --------------------------------------------------------
  container.registerInstance(TOKENS.TenantRepository, generic('tenant'));
  container.registerInstance(TOKENS.UserRepository, generic('user'));
  container.registerInstance(TOKENS.ProductRepository, generic('product'));
  container.registerInstance(TOKENS.MarketplaceRepository, generic('marketplace'));
  container.registerInstance(TOKENS.PriceListRepository, generic('priceList'));
  container.registerInstance(TOKENS.PriceRepository, generic('price'));
  container.registerInstance(TOKENS.PriceHistoryRepository, generic('priceHistory'));
  container.registerInstance(TOKENS.DiscountRepository, generic('discount'));
  container.registerInstance(TOKENS.CurrencyRepository, generic('currency'));
  container.registerInstance(TOKENS.PermissionRepository, generic('permission'));
  container.registerInstance(TOKENS.BrandRepository, generic('brand'));
  container.registerInstance(TOKENS.SupplierRepository, generic('supplier'));
  container.registerInstance(TOKENS.UnitOfMeasureRepository, generic('unitOfMeasure'));
  container.registerInstance(TOKENS.ApiKeyRepository, generic('apiKey'));
  container.registerInstance(TOKENS.RoleRepository, new RoleRepository(prisma, MODEL_OPTIONS.role));
  container.registerInstance(TOKENS.AuthRepository, new PrismaAuthRepository(prisma));

  // --- Generic CRUD services ----------------------------------------------
  container.registerInstance(TOKENS.ProductService, new CrudService(generic('product'), 'Product'));
  container.registerInstance(TOKENS.MarketplaceService, new CrudService(generic('marketplace'), 'Marketplace'));
  container.registerInstance(TOKENS.CurrencyService, new CrudService(generic('currency'), 'Currency'));
  container.registerInstance(TOKENS.PermissionService, new CrudService(generic('permission'), 'Permission'));
  container.registerInstance(TOKENS.PriceHistoryService, new CrudService(generic('priceHistory'), 'Price history'));
  container.registerInstance(TOKENS.BrandService, new CrudService(generic('brand'), 'Brand'));

  // --- Specialized services ------------------------------------------------
  // `SupplierService` and `UnitOfMeasureService` extend `CrudService` but add
  // lifecycle rules (revive-on-create, immutable code, referenced dimension,
  // protected decimals), so they are constructed by tsyringe instead of being
  // registered as a plain generic instance.
  container.register(TOKENS.SupplierService, { useClass: SupplierService });
  container.register(TOKENS.UnitOfMeasureService, { useClass: UnitOfMeasureService });
  container.register(TOKENS.AuthService, { useClass: AuthService });
  container.register(TOKENS.TenantService, { useClass: TenantService });
  container.register(TOKENS.UserService, { useClass: UserService });
  container.register(TOKENS.RoleService, { useClass: RoleService });
  container.register(TOKENS.ApiKeyService, { useClass: ApiKeyService });
  container.register(TOKENS.PriceService, { useClass: PriceService });
  container.register(TOKENS.PriceListService, { useClass: PriceListService });
  container.register(TOKENS.DiscountService, { useClass: DiscountService });
  container.register(TOKENS.DashboardService, { useClass: DashboardService });
  container.register(TOKENS.PriceListAccessService, { useClass: PriceListAccessService });
  container.register(TOKENS.PriceCatalogService, { useClass: PriceCatalogService });
  container.registerInstance(TOKENS.ExportStorage, new LocalExportStorage());
  container.register(TOKENS.ExportService, { useClass: ExportService });
  container.register(TOKENS.ProductSpecificationService, { useClass: ProductSpecificationService });

  // --- Controllers ---------------------------------------------------------
  container.register(TOKENS.AuthController, { useClass: AuthController });
  container.register(TOKENS.TenantController, { useClass: TenantController });
  container.register(TOKENS.ApiKeyController, { useClass: ApiKeyController });
  container.register(TOKENS.PriceController, { useClass: PriceController });
  container.register(TOKENS.DashboardController, { useClass: DashboardController });
  container.register(TOKENS.RoleController, { useClass: RoleController });
  container.register(TOKENS.PriceListController, { useClass: PriceListController });
  container.register(TOKENS.PriceCatalogController, { useClass: PriceCatalogController });
  container.register(TOKENS.ExportController, { useClass: ExportController });
  container.register(TOKENS.ProductSpecificationController, { useClass: ProductSpecificationController });
  container.register(TOKENS.UnitOfMeasureController, { useClass: UnitOfMeasureController });
  container.register(TOKENS.SupplierController, { useClass: SupplierController });

  return container;
}
