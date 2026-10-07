import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { hashPassword } from '../common/utils/password';
import { DEFAULT_LOCALE, requireSupportedLocale } from '../common/i18n/supported-locales';
import type { TenantCrudRepository } from '../common/crud/repository';
import type { ActorContext, ListQuery, Paginated } from '../types';

/** Never leak the password hash through the API. */
function sanitize<T extends Record<string, any> | null>(user: T): T {
  if (!user) return user;
  const clone: Record<string, any> = { ...user };
  delete clone.passwordHash;
  return clone as T;
}

/**
 * Resolves the locale an administrative write should persist.
 *
 * Omitted on create -> the documented default (`es-419`), so existing clients
 * and seeds keep their behaviour. An explicit value is validated here as well
 * as in Zod: the service is also reachable directly (tests, future jobs).
 */
function resolveCreateLocale(value: unknown): string {
  if (value === undefined || value === null || value === '') return DEFAULT_LOCALE;
  return requireSupportedLocale(value);
}

@injectable()
export class UserService extends CrudService<any> {
  constructor(
    @inject(TOKENS.UserRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.RoleRepository) private readonly roleRepository: TenantCrudRepository<any>
  ) {
    super(repository, 'User');
  }

  private async assertRoleIsAvailable(roleId: string, tenantId: string | null): Promise<void> {
    const role = await this.roleRepository.findById(tenantId, roleId);
    if (!role) {
      throw new ValidationError('Unknown role', [
        { field: 'roleId', message: 'role does not exist or is not available for this company' }
      ]);
    }
  }

  override async list(tenantId: string | null, query: ListQuery): Promise<Paginated<any>> {
    const result = await super.list(tenantId, query);
    return { data: result.data.map((item) => sanitize(item)), meta: result.meta };
  }

  override async get(tenantId: string | null, id: string): Promise<any> {
    return sanitize(await super.get(tenantId, id));
  }

  override async create(tenantId: string | null, data: Record<string, unknown>, actor: ActorContext): Promise<any> {
    const roleId = String(data.roleId ?? '');
    await this.assertRoleIsAvailable(roleId, tenantId);

    const email = String(data.email ?? '').trim().toLowerCase();
    const existing = await (this.repository as TenantCrudRepository<any>).findOne(tenantId, { email });
    if (existing) {
      throw new ConflictError('A user with that email already exists', 'EMAIL_ALREADY_EXISTS');
    }

    const password = String(data.password ?? '');
    const payload: Record<string, unknown> = {
      ...data,
      email,
      roleId,
      tenantId: data.tenantId ?? tenantId,
      passwordHash: await hashPassword(password),
      preferredLocale: resolveCreateLocale(data.preferredLocale)
    };
    delete payload.password;

    return sanitize(await this.repository.create(tenantId, payload, actor));
  }

  override async update(
    tenantId: string | null,
    id: string,
    data: Record<string, unknown>,
    actor: ActorContext
  ): Promise<any> {
    await super.get(tenantId, id);

    if (data.roleId) {
      await this.assertRoleIsAvailable(String(data.roleId), tenantId);
    }

    const payload: Record<string, unknown> = { ...data };

    if (payload.email) {
      const email = String(payload.email).trim().toLowerCase();
      const existing = await (this.repository as TenantCrudRepository<any>).findOne(tenantId, { email });
      if (existing && existing.id !== id) {
        throw new ConflictError('A user with that email already exists', 'EMAIL_ALREADY_EXISTS');
      }
      payload.email = email;
    }

    if (payload.password) {
      payload.passwordHash = await hashPassword(String(payload.password));
    }
    delete payload.password;

    // An unrelated update (e.g. only the name) must leave the stored locale
    // untouched; an explicit value is validated instead of silently coerced.
    if (payload.preferredLocale !== undefined) {
      payload.preferredLocale = requireSupportedLocale(payload.preferredLocale);
    } else {
      delete payload.preferredLocale;
    }

    if (payload.roleId === undefined && payload.tenantId === undefined && Object.keys(payload).length === 0) {
      throw new NotFoundError('Nothing to update');
    }

    return sanitize(await this.repository.update(tenantId, id, payload, actor));
  }
}
