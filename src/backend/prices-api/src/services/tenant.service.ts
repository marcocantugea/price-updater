import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { CrudService } from '../common/crud/service';
import { ValidationError } from '../common/errors';
import type { TenantCrudRepository } from '../common/crud/repository';
import { assertValidTimeZone } from '../common/utils/business-date';
import type { ActorContext } from '../types';

/**
 * Companies (tenants). Managed by the global admin; not tenant-scoped because
 * the tenant IS the entity.
 */
@injectable()
export class TenantService extends CrudService<any> {
  constructor(
    @inject(TOKENS.TenantRepository) repository: TenantCrudRepository<any>,
    @inject(TOKENS.CurrencyRepository) private readonly currencyRepository: TenantCrudRepository<any>
  ) {
    super(repository, 'Company');
  }

  /** The default currency must exist in the read-only currency catalog. */
  private async assertCurrencyExists(code: string): Promise<void> {
    const currency = await this.currencyRepository.findOne(null, { code });
    if (!currency) {
      throw new ValidationError('Unknown currency', [
        { field: 'defaultCurrency', message: `currency ${code} does not exist` }
      ]);
    }
  }

  override async create(tenantId: string | null, data: Record<string, unknown>, actor: any) {
    if (typeof data.defaultCurrency === 'string') {
      await this.assertCurrencyExists(data.defaultCurrency);
    }
    return super.create(tenantId, data, actor);
  }

  override async update(tenantId: string | null, id: string, data: Record<string, unknown>, actor: any) {
    if (typeof data.defaultCurrency === 'string') {
      await this.assertCurrencyExists(data.defaultCurrency);
    }
    return super.update(tenantId, id, data, actor);
  }

  /** Current company for non-global users. */
  async current(id: string): Promise<any> {
    return this.get(null, id);
  }

  async updateTimeZone(id: string, timeZone: string, actor: ActorContext): Promise<any> {
    assertValidTimeZone(timeZone);
    return this.update(null, id, { timeZone }, actor);
  }
}
