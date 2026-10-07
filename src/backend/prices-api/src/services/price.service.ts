import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ValidationError } from '../common/errors';
import { auditCreateFields, auditUpdateFields } from '../common/utils/audit';
import { assertReferencesBelongToTenant } from '../common/utils/tenant-references';
import { resolveTenantTimeZone } from '../common/utils/tenant-time-zone';
import { calculateFinalPrice, type PricingResult } from './pricing.engine';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext } from '../types';

export interface PriceCalculationInput {
  productId: string;
  priceListId: string;
  marketplaceId: string;
  basePrice: number;
  currencyCode: string;
  at?: Date;
}

/**
 * Orchestrates the pure pricing engine, validates that every referenced entity
 * belongs to the resolved tenant and writes an append-only row to
 * `price_history` whenever the base or final price changes.
 */
@injectable()
export class PriceService extends CrudService<any> {
  constructor(
    @inject(TOKENS.PriceRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.DiscountRepository) private readonly discountRepository: TenantCrudRepository<any>,
    @inject(TOKENS.CurrencyRepository) private readonly currencyRepository: TenantCrudRepository<any>,
    @inject(TOKENS.ProductRepository) private readonly productRepository: TenantCrudRepository<any>,
    @inject(TOKENS.PriceListRepository) private readonly priceListRepository: TenantCrudRepository<any>,
    @inject(TOKENS.MarketplaceRepository) private readonly marketplaceRepository: TenantCrudRepository<any>,
    @inject(TOKENS.Prisma) private readonly prisma: any
  ) {
    super(repository, 'Price');
  }

  private async decimalsFor(currencyCode: string): Promise<number> {
    const currency = await this.currencyRepository.findOne(null, { code: currencyCode });
    if (!currency) {
      throw new ValidationError('Unknown currency', [
        { field: 'currencyCode', message: `currency ${currencyCode} does not exist` }
      ]);
    }
    return currency.decimals ?? 2;
  }

  /**
   * Multi-tenant guard: a price may only reference a product, price list and
   * marketplace owned by the resolved tenant.
   */
  private async assertReferences(tenantId: string | null, input: PriceCalculationInput): Promise<void> {
    await assertReferencesBelongToTenant([
      {
        repository: this.productRepository,
        tenantId,
        id: input.productId,
        field: 'productId',
        label: 'product'
      },
      {
        repository: this.priceListRepository,
        tenantId,
        id: input.priceListId,
        field: 'priceListId',
        label: 'price list'
      },
      {
        repository: this.marketplaceRepository,
        tenantId,
        id: input.marketplaceId,
        field: 'marketplaceId',
        label: 'marketplace'
      }
    ]);
  }

  /** Preview used by `POST /prices/calculate` and internally on writes. */
  async preview(tenantId: string | null, input: PriceCalculationInput): Promise<PricingResult> {
    await this.assertReferences(tenantId, input);

    const decimals = await this.decimalsFor(input.currencyCode);
    const discounts = await this.discountRepository.findMany(tenantId, { status: 'active' });
    const timeZone = await resolveTenantTimeZone(this.prisma, tenantId);

    return calculateFinalPrice(
      {
        productId: input.productId,
        priceListId: input.priceListId,
        marketplaceId: input.marketplaceId,
        basePrice: input.basePrice,
        currencyDecimals: decimals
      },
      discounts as any,
      { now: input.at ?? new Date(), timeZone }
    );
  }

  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const basePrice = Number(data.basePrice);
    const pricing = await this.preview(tenantId, { ...(data as any), basePrice });

    const created = await this.prisma.$transaction(async (tx: any) => {
      const price = await tx.price.create({
        data: {
          ...data,
          basePrice,
          finalPrice: pricing.finalPrice,
          tenantId,
          ...auditCreateFields(actor)
        }
      });

      await tx.priceHistory.create({
        data: {
          tenantId,
          priceId: price.id,
          productId: price.productId,
          oldBasePrice: null,
          newBasePrice: price.basePrice,
          oldFinalPrice: null,
          newFinalPrice: price.finalPrice,
          changedByType: actor.type,
          changedById: actor.id,
          reason: 'create'
        }
      });

      return price;
    });

    return this.get(tenantId, created.id);
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const existing = await this.get(tenantId, id);

    const basePrice = data.basePrice !== undefined ? Number(data.basePrice) : Number(existing.basePrice);
    const pricing = await this.preview(tenantId, {
      productId: existing.productId,
      priceListId: existing.priceListId,
      marketplaceId: existing.marketplaceId,
      basePrice,
      currencyCode: (data.currencyCode as string) ?? existing.currencyCode
    });

    const baseChanged = Number(existing.basePrice) !== pricing.basePrice;
    const finalChanged = Number(existing.finalPrice) !== pricing.finalPrice;

    await this.prisma.$transaction(async (tx: any) => {
      await tx.price.update({
        where: { id },
        data: {
          ...data,
          ...(data.basePrice !== undefined ? { basePrice } : {}),
          finalPrice: pricing.finalPrice,
          ...auditUpdateFields(actor)
        }
      });

      if (baseChanged || finalChanged) {
        await tx.priceHistory.create({
          data: {
            tenantId,
            priceId: id,
            productId: existing.productId,
            oldBasePrice: existing.basePrice,
            newBasePrice: pricing.basePrice,
            oldFinalPrice: existing.finalPrice,
            newFinalPrice: pricing.finalPrice,
            changedByType: actor.type,
            changedById: actor.id,
            reason: 'update'
          }
        });
      }
    });

    return this.get(tenantId, id);
  }
}
