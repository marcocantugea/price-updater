import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { TOKENS } from '../di/tokens';
import { NotFoundError, ValidationError } from '../common/errors';
import { logger } from '../common/logger';
import { DEFAULT_LOCALE } from '../common/i18n/supported-locales';
import { serializeCatalogExport, type ExportFormat } from './export.serializers';
import type { PriceCatalogService } from './price-catalog.service';
import type { ActorContext, AuthUser } from '../types';
import type { LocalExportStorage } from './export.storage';

export interface ExportInput {
  priceListId: string;
  marketplaceId: string;
  format: ExportFormat;
  search?: string;
}

/**
 * Requester reference and audit actor for a queued export.
 *
 * `export_requests` carries the composite foreign key
 * `(tenant_id, requested_by_user_id) -> users(tenant_id, id)`, so a stored
 * requester id must be a user **of the exported company**. That does not hold for
 * a global administrator: `users.tenant_id` is NULL while the export targets the
 * company selected in the `X-Tenant-Id` header. Writing their id there violates
 * the constraint (Prisma P2003) and used to fail the whole request with a 500.
 *
 * When the requester is not a member of the company the reference is stored as
 * NULL and the request is audited as `system`, which is what it is: the company
 * (not the user) owns the resulting file.
 */
function requesterFields(
  tenantId: string,
  user: AuthUser,
  actor: ActorContext
): { requestedByUserId: string | null; createdBy: string | null; createdByType: ActorContext['type'] } {
  if (user.tenantId === tenantId) {
    return { requestedByUserId: user.id, createdBy: actor.id, createdByType: actor.type };
  }

  logger.info(
    { userId: user.id, userTenantId: user.tenantId, tenantId },
    'export_requester_outside_tenant'
  );
  return { requestedByUserId: null, createdBy: null, createdByType: 'system' };
}

@injectable()
export class ExportService {
  constructor(
    @inject(TOKENS.Prisma) private readonly prisma: any,
    @inject(TOKENS.PriceCatalogService) private readonly catalog: PriceCatalogService,
    @inject(TOKENS.ExportStorage) private readonly storage: LocalExportStorage
  ) {}

  async request(tenantId: string, user: AuthUser, input: ExportInput, actor: ActorContext): Promise<any> {
    await this.catalog.assertExportInput(tenantId, user, input.priceListId, input.marketplaceId);
    return this.prisma.exportRequest.create({
      data: {
        id: randomUUID(),
        tenantId,
        ...requesterFields(tenantId, user, actor),
        priceListId: input.priceListId,
        marketplaceId: input.marketplaceId,
        format: input.format,
        filters: input.search ? { search: input.search } : null,
        status: 'queued',
        expiresAt: new Date(Date.now() + env.exports.retentionHours * 60 * 60 * 1000)
      }
    });
  }

  /**
   * Ownership filter for reading an export back.
   *
   * A request queued by a user of the company is owned by that user and stays
   * private to them. A request queued by a requester who does not belong to the
   * company (a global administrator; see `requesterFields`) is stored with a NULL
   * requester and is therefore owned by the company itself. Exposing those rows
   * to whoever administers the company is what keeps a global-admin export
   * visible in *My exports* and downloadable after this fix, instead of
   * disappearing into a row no session can address.
   */
  private async ownershipFilter(tenantId: string, user: AuthUser): Promise<Record<string, unknown>> {
    const ownFiles: Record<string, unknown> = { tenantId, requestedByUserId: user.id };
    if (!(await this.catalog.canReadAll(user))) return ownFiles;
    return { tenantId, OR: [ownFiles, { tenantId, requestedByUserId: null }] };
  }

  async list(tenantId: string, user: AuthUser): Promise<any[]> {
    return this.prisma.exportRequest.findMany({
      where: await this.ownershipFilter(tenantId, user),
      orderBy: { createdAt: 'desc' }
    });
  }

  async get(tenantId: string, user: AuthUser, id: string): Promise<any> {
    const row = await this.prisma.exportRequest.findFirst({
      where: { ...(await this.ownershipFilter(tenantId, user)), id }
    });
    if (!row) throw new NotFoundError('Export request not found');
    if (row.expiresAt && row.expiresAt.getTime() < Date.now() && row.status === 'completed') {
      await this.prisma.exportRequest.update({ where: { id }, data: { status: 'expired' } });
      row.status = 'expired';
    }
    return row;
  }

  async download(tenantId: string, user: AuthUser, id: string): Promise<{ row: any; content: Buffer }> {
    const row = await this.get(tenantId, user, id);
    if (row.status !== 'completed' || !row.storageKey) {
      throw new ValidationError('Export is not ready', [{ field: 'id', message: 'the export is not downloadable' }]);
    }
    await this.catalog.assertExportInput(tenantId, user, row.priceListId, row.marketplaceId);
    return { row, content: await this.storage.read(row.storageKey) };
  }

  async processPending(workerId: string): Promise<boolean> {
    const staleAt = new Date(Date.now() - 10 * 60 * 1000);
    const queued = await this.prisma.exportRequest.findFirst({
      where: {
        OR: [{ status: 'queued' }, { status: 'processing', lockedAt: { lt: staleAt } }]
      },
      orderBy: { createdAt: 'asc' }
    });
    if (!queued) return false;

    const claimed = await this.prisma.exportRequest.updateMany({
      where: { id: queued.id, OR: [{ status: 'queued' }, { status: 'processing', lockedAt: { lt: staleAt } }] },
      data: { status: 'processing', lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attemptCount: { increment: 1 } }
    });
    if (claimed.count !== 1) return false;

    try {
      const job = await this.prisma.exportRequest.findUnique({ where: { id: queued.id } });
      /**
       * The worker reads the whole catalog of the job's company under its own
       * authority (`price-catalog:read-all` short-circuits `assertVisible`), so it
       * is nobody's delegate. The id is therefore synthetic and unused: `AuthUser`
       * requires one, and the request's own requester is unknown by design here —
       * a global admin's export is owned by the company, stored with a NULL
       * requester.
       */
      const workerUser: AuthUser = {
        id: `worker:${workerId}`,
        email: '',
        name: '',
        roleId: '',
        roleSlug: 'worker',
        tenantId: job.tenantId,
        isGlobalAdmin: true,
        permissions: ['price-catalog:read-all', 'price-catalog:export'],
        // The export worker has no interactive user; exports are not localized
        // in this phase, so the default locale is only a contract placeholder.
        preferredLocale: DEFAULT_LOCALE
      };
      const rows: any[] = [];
      let page = 1;
      const search = job.filters?.search as string | undefined;
      while (true) {
        const result = await this.catalog.list(job.tenantId, workerUser, {
          page,
          limit: 100,
          order: 'asc',
          priceListId: job.priceListId,
          marketplaceId: job.marketplaceId,
          ...(search ? { search } : {})
        });
        rows.push(...result.data);
        if (page >= result.meta.totalPages || result.data.length === 0) break;
        page += 1;
      }

      const serialized = serializeCatalogExport(job.format, rows, {
        priceListId: job.priceListId,
        marketplaceId: job.marketplaceId,
        generatedAt: new Date().toISOString()
      });
      const storageKey = `${job.tenantId}/${job.id}.${serialized.extension}`;
      const stored = await this.storage.put(storageKey, serialized.content);
      await this.prisma.exportRequest.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + env.exports.retentionHours * 60 * 60 * 1000),
          storageKey: stored.storageKey,
          fileName: `price-catalog-${job.priceListId}.${serialized.extension}`,
          contentType: serialized.contentType,
          byteSize: stored.byteSize,
          checksum: stored.checksum,
          errorCode: null,
          errorMessage: null
        }
      });
    } catch (error) {
      const job = await this.prisma.exportRequest.findUnique({ where: { id: queued.id } });
      const terminal = Number(job?.attemptCount ?? 0) >= Number(job?.maxAttempts ?? 3);
      await this.prisma.exportRequest.update({
        where: { id: queued.id },
        data: {
          status: terminal ? 'failed' : 'queued',
          lockedAt: null,
          lockedBy: null,
          errorCode: 'EXPORT_PROCESSING_FAILED',
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown export error'
        }
      });
    }
    return true;
  }
}
