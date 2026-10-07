import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ConflictError, ValidationError } from '../common/errors';
import { assertReferencesBelongToTenant } from '../common/utils/tenant-references';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

interface ScopeState {
  appliesTo: string;
  productId: string | null;
  priceListId: string | null;
  marketplaceId: string | null;
}

/**
 * Discounts are product-, price-list- or marketplace-scoped. Because the two
 * unused scope columns are necessarily NULL, the schema cannot express a
 * composite `tenant_id` foreign key, so tenant ownership of the referenced
 * entity is enforced here on every write.
 */
@injectable()
export class DiscountService extends CrudService<any> {
  constructor(
    @inject(TOKENS.DiscountRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.ProductRepository) private readonly productRepository: TenantCrudRepository<any>,
    @inject(TOKENS.PriceListRepository) private readonly priceListRepository: TenantCrudRepository<any>,
    @inject(TOKENS.MarketplaceRepository) private readonly marketplaceRepository: TenantCrudRepository<any>
  ) {
    super(repository, 'Discount');
  }

  private async assertNameAvailable(tenantId: string | null, name: string, id?: string): Promise<void> {
    const existing = await this.repository.client.discount.findFirst({ where: { tenantId, name } });
    if (existing && existing.id !== id) {
      throw new ConflictError('A discount with that name already exists in this company', 'DISCOUNT_NAME_TAKEN');
    }
  }

  private normalizeName(data: Record<string, unknown>): Record<string, unknown> {
    return typeof data.name === 'string' ? { ...data, name: data.name.trim() } : data;
  }

  private normalizeScopeData(data: Record<string, unknown>, scope: ScopeState): Record<string, unknown> {
    const fields = ['productId', 'priceListId', 'marketplaceId'] as const;
    const activeField = `${scope.appliesTo === 'price_list' ? 'priceList' : scope.appliesTo}Id` as (typeof fields)[number];

    if (!scope[activeField]) {
      throw new ValidationError('Invalid discount scope', [
        { field: activeField, message: `${activeField} is required for '${scope.appliesTo}' discounts` }
      ]);
    }

    for (const field of fields) {
      if (field !== activeField && data[field] !== undefined && data[field] !== null) {
        throw new ValidationError('Invalid discount scope', [
          { field, message: `${field} must be empty when appliesTo is '${scope.appliesTo}'` }
        ]);
      }
    }

    return {
      ...data,
      productId: activeField === 'productId' ? scope.productId : null,
      priceListId: activeField === 'priceListId' ? scope.priceListId : null,
      marketplaceId: activeField === 'marketplaceId' ? scope.marketplaceId : null
    };
  }

  private async assertScopeBelongsToTenant(tenantId: string | null, scope: ScopeState): Promise<void> {
    switch (scope.appliesTo) {
      case 'product':
        await assertReferencesBelongToTenant([
          {
            repository: this.productRepository,
            tenantId,
            id: scope.productId,
            field: 'productId',
            label: 'product'
          }
        ]);
        return;
      case 'price_list':
        await assertReferencesBelongToTenant([
          {
            repository: this.priceListRepository,
            tenantId,
            id: scope.priceListId,
            field: 'priceListId',
            label: 'price list'
          }
        ]);
        return;
      case 'marketplace':
        await assertReferencesBelongToTenant([
          {
            repository: this.marketplaceRepository,
            tenantId,
            id: scope.marketplaceId,
            field: 'marketplaceId',
            label: 'marketplace'
          }
        ]);
        return;
      default:
        return;
    }
  }

  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const normalizedData = this.normalizeName(data);
    await this.assertNameAvailable(tenantId, String(normalizedData.name ?? ''));
    const scope: ScopeState = {
      appliesTo: String(normalizedData.appliesTo),
      productId: (normalizedData.productId as string) ?? null,
      priceListId: (normalizedData.priceListId as string) ?? null,
      marketplaceId: (normalizedData.marketplaceId as string) ?? null
    };
    await this.assertScopeBelongsToTenant(tenantId, scope);

    return super.create(tenantId, this.normalizeScopeData(normalizedData, scope), actor);
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);
    const normalizedData = this.normalizeName(data);
    if (normalizedData.name !== undefined) {
      await this.assertNameAvailable(tenantId, String(normalizedData.name), id);
    }

    // Merge the partial payload with the stored scope before validating.
    const appliesTo = (normalizedData.appliesTo as string) ?? existing.appliesTo;
    const scopeChanged = normalizedData.appliesTo !== undefined && normalizedData.appliesTo !== existing.appliesTo;
    const fieldValue = (field: 'productId' | 'priceListId' | 'marketplaceId'): string | null => {
      if (normalizedData[field] !== undefined) return (normalizedData[field] as string) ?? null;
      if (scopeChanged) return null;
      return existing[field] ?? null;
    };
    const effective: ScopeState = {
      appliesTo,
      productId: fieldValue('productId'),
      priceListId: fieldValue('priceListId'),
      marketplaceId: fieldValue('marketplaceId')
    };

    await this.assertScopeBelongsToTenant(tenantId, effective);

    return super.update(tenantId, id, this.normalizeScopeData(normalizedData, effective), actor);
  }
}
