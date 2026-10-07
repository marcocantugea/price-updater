import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { NotFoundError, ValidationError } from '../common/errors';
import { buildPaginationMeta } from '../common/utils/pagination';
import { businessDateKey, dateKeyToStoredDate } from '../common/utils/business-date';
import { resolveTenantTimeZone } from '../common/utils/tenant-time-zone';
import { calculateFinalPrice } from './pricing.engine';
import type { AuthUser, ListQuery, Paginated } from '../types';
import type { PriceListAccessService } from './price-list-access.service';

export interface CatalogQuery extends ListQuery {
  priceListId: string;
  marketplaceId: string;
}

@injectable()
export class PriceCatalogService {
  constructor(
    @inject(TOKENS.Prisma) private readonly prisma: any,
    @inject(TOKENS.PriceListAccessService) private readonly access: PriceListAccessService
  ) {}

  async priceLists(tenantId: string, user: AuthUser): Promise<any[]> {
    return this.access.visiblePriceLists(tenantId, user);
  }

  async marketplaces(tenantId: string, user: AuthUser, priceListId: string): Promise<any[]> {
    await this.access.assertVisible(tenantId, user, priceListId);
    const rows = await this.prisma.priceListMarketplace.findMany({
      where: { tenantId, priceListId },
      include: { marketplace: true }
    });
    return rows.map((row: any) => row.marketplace).filter((row: any) => row.status === 'active' && !row.deletedAt);
  }

  async list(tenantId: string, user: AuthUser, query: CatalogQuery): Promise<Paginated<any>> {
    await this.access.assertVisible(tenantId, user, query.priceListId);
    const marketplace = await this.prisma.marketplace.findFirst({
      where: { tenantId, id: query.marketplaceId, status: 'active', deletedAt: null }
    });
    if (!marketplace) throw new NotFoundError('Marketplace not found');
    const relation = await this.prisma.priceListMarketplace.findFirst({
      where: { tenantId, priceListId: query.priceListId, marketplaceId: query.marketplaceId }
    });
    if (!relation) throw new NotFoundError('Marketplace not found');

    const now = new Date();
    const timeZone = await resolveTenantTimeZone(this.prisma, tenantId);
    const currentDate = dateKeyToStoredDate(businessDateKey(now, timeZone));
    const prices = await this.prisma.price.findMany({
      where: {
        tenantId,
        priceListId: query.priceListId,
        marketplaceId: query.marketplaceId,
        status: 'active',
        deletedAt: null,
        startDate: { lte: currentDate },
        OR: [{ endDate: null }, { endDate: { gte: currentDate } }]
      },
      include: {
        product: { include: { currency: true } },
        priceList: true,
        marketplace: true,
        currency: true
      },
      orderBy: [{ startDate: 'desc' }, { updatedAt: 'desc' }]
    });

    const discounts = await this.prisma.discount.findMany({
      where: { tenantId, status: 'active', deletedAt: null }
    });
    const currencies = await this.prisma.currency.findMany({ where: { status: 'active', deletedAt: null } });
    const decimals = new Map<string, number>(
      currencies.map((currency: any): [string, number] => [currency.code, Number(currency.decimals ?? 2)])
    );
    const search = query.search?.trim().toLowerCase();
    const seenProducts = new Set<string>();
    const result: any[] = [];

    for (const price of prices) {
      if (seenProducts.has(price.productId)) continue;
      const product = price.product;
      if (search && !`${product.sku} ${product.name}`.toLowerCase().includes(search)) continue;
      seenProducts.add(price.productId);

      const calculation = calculateFinalPrice(
        {
          productId: price.productId,
          priceListId: price.priceListId,
          marketplaceId: price.marketplaceId,
          basePrice: Number(price.basePrice),
          currencyDecimals: decimals.get(price.currencyCode) ?? 2
        },
        discounts,
        { now, timeZone }
      );

      result.push({
        product: { id: product.id, sku: product.sku, name: product.name },
        priceList: { id: price.priceList.id, name: price.priceList.name },
        marketplace: { id: marketplace.id, name: marketplace.name, code: marketplace.code },
        basePrice: calculation.basePrice,
        discountAmount: calculation.discountAmount,
        finalPrice: calculation.finalPrice,
        scope: calculation.scope,
        appliedDiscount: calculation.appliedDiscount,
        currencyCode: price.currencyCode,
        calculatedAt: now.toISOString()
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    return {
      data: result.slice(start, start + limit),
      meta: buildPaginationMeta(page, limit, result.length)
    };
  }

  async assertExportInput(tenantId: string, user: AuthUser, priceListId: string, marketplaceId: string): Promise<void> {
    await this.access.assertVisible(tenantId, user, priceListId);
    const relation = await this.prisma.priceListMarketplace.findFirst({
      where: { tenantId, priceListId, marketplaceId }
    });
    if (!relation) {
      throw new ValidationError('Invalid catalog selection', [
        { field: 'marketplaceId', message: 'marketplace is not available for this price list' }
      ]);
    }
  }
}
