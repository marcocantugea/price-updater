import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ValidationError } from '../common/errors';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

/**
 * Price lists own the product<->list and list<->marketplace relations, which
 * are replaced wholesale through dedicated endpoints.
 */
@injectable()
export class PriceListService extends CrudService<any> {
  constructor(
    @inject(TOKENS.PriceListRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.ProductRepository) private readonly productRepository: TenantCrudRepository<any>,
    @inject(TOKENS.MarketplaceRepository) private readonly marketplaceRepository: TenantCrudRepository<any>,
    @inject(TOKENS.Prisma) private readonly prisma: any
  ) {
    super(repository, 'Price list');
  }

  private async assertAllExist(
    repository: TenantCrudRepository<any>,
    tenantId: string | null,
    ids: string[],
    field: string,
    label: string
  ): Promise<void> {
    if (ids.length === 0) return;
    const found = await repository.findMany(tenantId, { id: { in: ids } });
    const foundIds = new Set(found.map((row: any) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new ValidationError(`Unknown ${label}`, [
        { field, message: `not found for this company: ${missing.join(', ')}` }
      ]);
    }
  }

  async setProducts(
    tenantId: string | null,
    id: string,
    productIds: string[],
    _actor: ActorContext
  ): Promise<string[]> {
    if (!tenantId) {
      throw new ValidationError('Tenant context is required to manage price-list relations');
    }
    await this.get(tenantId, id);
    await this.assertAllExist(this.productRepository, tenantId, productIds, 'productIds', 'products');

    await this.prisma.$transaction(async (tx: any) => {
      await tx.priceListProduct.deleteMany({ where: { tenantId, priceListId: id } });
      if (productIds.length > 0) {
        await tx.priceListProduct.createMany({
          data: productIds.map((productId) => ({ tenantId, priceListId: id, productId }))
        });
      }
    });

    return productIds;
  }

  async setMarketplaces(
    tenantId: string | null,
    id: string,
    marketplaceIds: string[],
    _actor: ActorContext
  ): Promise<string[]> {
    if (!tenantId) {
      throw new ValidationError('Tenant context is required to manage price-list relations');
    }
    await this.get(tenantId, id);
    await this.assertAllExist(
      this.marketplaceRepository,
      tenantId,
      marketplaceIds,
      'marketplaceIds',
      'marketplaces'
    );

    await this.prisma.$transaction(async (tx: any) => {
      await tx.priceListMarketplace.deleteMany({ where: { tenantId, priceListId: id } });
      if (marketplaceIds.length > 0) {
        await tx.priceListMarketplace.createMany({
          data: marketplaceIds.map((marketplaceId) => ({ tenantId, priceListId: id, marketplaceId }))
        });
      }
    });

    return marketplaceIds;
  }
}
