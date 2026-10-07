import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { NotFoundError, ValidationError } from '../common/errors';
import type { ActorContext, AuthUser } from '../types';

@injectable()
export class PriceListAccessService {
  constructor(@inject(TOKENS.Prisma) private readonly prisma: any) {}

  private async assertUser(tenantId: string, userId: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: { role: { select: { slug: true, name: true } } }
    });
    if (!user) throw new NotFoundError('User not found');
    if (user.tenantId === null) {
      throw new ValidationError('Global users cannot receive company price-list access');
    }
    return user;
  }

  private async assertPriceLists(tenantId: string, priceListIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(priceListIds)];
    if (uniqueIds.length === 0) return;
    const rows = await this.prisma.priceList.findMany({
      where: { tenantId, id: { in: uniqueIds }, status: 'active', deletedAt: null }
    });
    if (rows.length !== uniqueIds.length) {
      const found = new Set(rows.map((row: any) => row.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new ValidationError('Unknown price lists', [
        { field: 'priceListIds', message: `not found for this company: ${missing.join(', ')}` }
      ]);
    }
  }

  async get(tenantId: string, userId: string): Promise<{ userId: string; priceListIds: string[]; priceLists: any[] }> {
    await this.assertUser(tenantId, userId);
    const rows = await this.prisma.userPriceListAccess.findMany({
      where: { tenantId, userId },
      include: { priceList: true },
      orderBy: { priceList: { name: 'asc' } }
    });
    return {
      userId,
      priceListIds: rows.map((row: any) => row.priceListId),
      priceLists: rows.map((row: any) => row.priceList)
    };
  }

  async replace(
    tenantId: string,
    userId: string,
    priceListIds: string[],
    actor: ActorContext
  ): Promise<{ userId: string; priceListIds: string[]; priceLists: any[] }> {
    await this.assertUser(tenantId, userId);
    const uniqueIds = [...new Set(priceListIds)];
    await this.assertPriceLists(tenantId, uniqueIds);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.userPriceListAccess.deleteMany({ where: { tenantId, userId } });
      if (uniqueIds.length > 0) {
        await tx.userPriceListAccess.createMany({
          data: uniqueIds.map((priceListId) => ({
            tenantId,
            userId,
            priceListId,
            createdBy: actor.id,
            createdByType: actor.type
          }))
        });
      }
    });

    return this.get(tenantId, userId);
  }

  async canReadAll(user: AuthUser): Promise<boolean> {
    return user.isGlobalAdmin || user.permissions.includes('price-catalog:read-all');
  }

  async assertVisible(tenantId: string, user: AuthUser, priceListId: string): Promise<void> {
    if (await this.canReadAll(user)) {
      const list = await this.prisma.priceList.findFirst({ where: { tenantId, id: priceListId, deletedAt: null } });
      if (!list) throw new NotFoundError('Price list not found');
      return;
    }

    const access = await this.prisma.userPriceListAccess.findFirst({
      where: { tenantId, userId: user.id, priceListId },
      include: { priceList: true }
    });
    if (!access || access.priceList.status !== 'active' || access.priceList.deletedAt) {
      throw new NotFoundError('Price list not found');
    }
  }

  async visiblePriceLists(tenantId: string, user: AuthUser): Promise<any[]> {
    if (await this.canReadAll(user)) {
      return this.prisma.priceList.findMany({
        where: { tenantId, status: 'active', deletedAt: null },
        orderBy: { name: 'asc' }
      });
    }

    const rows = await this.prisma.userPriceListAccess.findMany({
      where: { tenantId, userId: user.id },
      include: { priceList: true },
      orderBy: { priceList: { name: 'asc' } }
    });
    return rows.map((row: any) => row.priceList).filter((row: any) => row.status === 'active' && !row.deletedAt);
  }
}
