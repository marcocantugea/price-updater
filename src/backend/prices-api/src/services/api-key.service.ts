import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { UnauthorizedError } from '../common/errors';
import {
  effectiveApiKeyStatus,
  generateApiKey,
  hashApiKey,
  normalizeScopes
} from '../common/utils/api-key';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext, ApiKeyContext, ListQuery, Paginated } from '../types';

export interface CreatedApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: string;
  expiresAt: Date | null;
  plaintextKey: string;
}

/** Adds the derived/effective status without persisting it. */
function withEffectiveStatus(key: any): any {
  if (!key) return key;
  return { ...key, effectiveStatus: effectiveApiKeyStatus(key) };
}

@injectable()
export class ApiKeyService extends CrudService<any> implements ApiKeyResolverLike {
  constructor(@inject(TOKENS.ApiKeyRepository) repository: TenantCrudRepository<any>) {
    super(repository, 'API key');
  }

  override async list(tenantId: string | null, query: ListQuery): Promise<Paginated<any>> {
    const result = await super.list(tenantId, query);
    return { data: result.data.map(withEffectiveStatus), meta: result.meta };
  }

  override async get(tenantId: string | null, id: string): Promise<any> {
    return withEffectiveStatus(await super.get(tenantId, id));
  }

  /** The plaintext key is returned exactly once, at creation time. */
  override async create(
    tenantId: string | null,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<CreatedApiKey> {
    const { plaintext, prefix } = generateApiKey();
    const payload: Record<string, unknown> = {
      name: data.name,
      scopes: normalizeScopes(data.scopes),
      expiresAt: data.expiresAt ?? null,
      keyHash: hashApiKey(plaintext),
      prefix,
      status: 'active'
    };

    const created = await this.repository.create(tenantId, payload, actor);

    return {
      id: created.id,
      tenantId: created.tenantId,
      name: created.name,
      prefix: created.prefix,
      scopes: normalizeScopes(created.scopes),
      status: created.status,
      expiresAt: created.expiresAt,
      plaintextKey: plaintext
    };
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    const payload: Record<string, unknown> = { ...data };
    if (payload.scopes !== undefined) {
      payload.scopes = normalizeScopes(payload.scopes);
    }
    return withEffectiveStatus(await super.update(tenantId, id, payload, actor));
  }

  /** Revocation is persisted (revoked_at + status) — not derived. */
  async revoke(tenantId: string | null, id: string, actor: ActorContext): Promise<any> {
    await this.get(tenantId, id);
    const revoked = await this.repository.update(
      tenantId,
      id,
      { status: 'revoked', revokedAt: new Date() },
      actor
    );
    return withEffectiveStatus(revoked);
  }

  /**
   * Resolves an external request: hashes the presented key, loads the owner
   * tenant + scopes and rejects revoked/expired keys.
   */
  async resolveByRawKey(rawKey: string): Promise<ApiKeyContext> {
    const keyHash = hashApiKey(rawKey);
    // API keys are looked up across tenants — the key itself selects the tenant.
    const record = await this.repository.client.apiKey.findFirst({
      where: { keyHash, deletedAt: null }
    });

    if (!record) {
      throw new UnauthorizedError('Invalid API key', 'INVALID_API_KEY');
    }

    const status = effectiveApiKeyStatus(record);
    if (status === 'revoked') {
      throw new UnauthorizedError('API key has been revoked', 'API_KEY_REVOKED');
    }
    if (status === 'expired') {
      throw new UnauthorizedError('API key has expired', 'API_KEY_EXPIRED');
    }

    await this.repository.client.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() }
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      scopes: normalizeScopes(record.scopes)
    };
  }
}

export interface ApiKeyResolverLike {
  resolveByRawKey(rawKey: string): Promise<ApiKeyContext>;
}
