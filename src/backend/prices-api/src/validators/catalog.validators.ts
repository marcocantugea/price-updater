import { z } from 'zod';
import { paginationQuerySchema, recordStatusSchema, uuidSchema } from './common.validators';

/**
 * Shared body for the `name` + `status` catalogs (brands, suppliers).
 *
 * Strict on purpose: a client must not be able to set `tenantId`, audit columns,
 * or `deletedAt` by putting them in the body. The repository would override
 * `tenantId` anyway, but silently accepting the field hides a client bug.
 */
export const createNamedCatalogSchema = z
  .object({
    name: z.string().trim().min(1, 'is required').max(150),
    status: recordStatusSchema.optional()
  })
  .strict();

/** Same shape, every key optional. Strictness is preserved by `partial()`. */
export const updateNamedCatalogSchema = createNamedCatalogSchema.partial();

export const priceListAccessSchema = z
  .object({ priceListIds: z.array(uuidSchema).max(100) })
  .strict();

export const catalogQuerySchema = paginationQuerySchema
  .extend({
    priceListId: uuidSchema,
    marketplaceId: uuidSchema
  })
  .strict();

export const catalogMarketplacesQuerySchema = z
  .object({ priceListId: uuidSchema })
  .strict();

export const exportRequestSchema = z
  .object({
    priceListId: uuidSchema,
    marketplaceId: uuidSchema,
    format: z.enum(['csv', 'json', 'txt']),
    search: z.string().trim().max(200).optional()
  })
  .strict();
