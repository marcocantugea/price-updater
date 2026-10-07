import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { businessDateKey, dateKeyToStoredDate, addBusinessDays } from '../common/utils/business-date';
import { resolveTenantTimeZone } from '../common/utils/tenant-time-zone';

const EXPIRING_WINDOW_DAYS = 30;

@injectable()
export class DashboardService {
  constructor(@inject(TOKENS.Prisma) private readonly prisma: any) {}

  async summary(tenantId: string) {
    const now = new Date();
    const timeZone = await resolveTenantTimeZone(this.prisma, tenantId);
    const currentDate = dateKeyToStoredDate(businessDateKey(now, timeZone));
    const soon = dateKeyToStoredDate(addBusinessDays(businessDateKey(now, timeZone), EXPIRING_WINDOW_DAYS));

    const [activeProducts, marketplaces, priceLists, expiringDiscounts, activePrices] = await Promise.all([
      this.prisma.product.count({ where: { tenantId, deletedAt: null, status: 'active' } }),
      this.prisma.marketplace.count({ where: { tenantId, deletedAt: null, status: 'active' } }),
      this.prisma.priceList.count({ where: { tenantId, deletedAt: null, status: 'active' } }),
      this.prisma.discount.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'active',
          endDate: { not: null, gte: currentDate, lte: soon }
        },
        orderBy: { endDate: 'asc' },
        take: 10
      }),
      this.prisma.price.count({ where: { tenantId, deletedAt: null, status: 'active' } })
    ]);

    return {
      activeProducts,
      marketplaces,
      priceLists,
      activePrices,
      expiringDiscounts,
      expiringWindowDays: EXPIRING_WINDOW_DAYS
    };
  }

  async recentPrices(tenantId: string, limit = 8) {
    return this.prisma.price.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      include: {
        product: { select: { id: true, sku: true, name: true } },
        priceList: { select: { id: true, name: true } },
        marketplace: { select: { id: true, name: true, code: true } }
      }
    });
  }

  async pricesByMarketplace(tenantId: string) {
    const [grouped, marketplaces] = await Promise.all([
      this.prisma.price.groupBy({
        by: ['marketplaceId'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
        _avg: { finalPrice: true }
      }),
      this.prisma.marketplace.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, code: true }
      })
    ]);

    const byId = new Map<string, any>(marketplaces.map((m: any) => [m.id, m]));

    return grouped.map((row: any) => {
      const marketplace = byId.get(row.marketplaceId);
      return {
        marketplaceId: row.marketplaceId,
        name: marketplace?.name ?? 'Unknown',
        code: marketplace?.code ?? null,
        priceCount: row._count?._all ?? 0,
        averageFinalPrice: row._avg?.finalPrice != null ? Number(row._avg.finalPrice) : 0
      };
    });
  }
}
