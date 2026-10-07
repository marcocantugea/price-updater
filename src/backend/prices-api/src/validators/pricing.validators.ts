import { z } from 'zod';
import {
  currencyCodeSchema,
  dateOnlySchema,
  optionalText,
  recordStatusSchema,
  withValidDateRange
} from './common.validators';

/**
 * Request-body schemas are STRICT: unknown/extra fields are rejected with a
 * 422 instead of being silently stripped.
 */

// --- Products --------------------------------------------------------------

/**
 * Upper bound of `Product.cost`, which is stored as DECIMAL(12, 2).
 */
const MAX_PRODUCT_COST = 9_999_999_999.99;

/**
 * Canonical decimal form of a monetary amount, with at most two fractional
 * digits. Checked against `String(value)` on purpose: `(value * 100) % 1 === 0`
 * looks equivalent but rejects valid amounts such as 0.07 or 0.29, because those
 * values are not exact binary fractions. The string form never has three
 * fractional digits for a value that came from two decimal places.
 */
const COST_SCALE = /^\d+(\.\d{1,2})?$/;

/**
 * Current product cost.
 *
 * Deliberately `z.number()` and NOT `z.coerce.number()` (the pattern used by
 * `basePrice`): coercion would turn `null` into 0, and 0 is a real known cost
 * while `null` means "not captured". It would also accept `""`, `false` and
 * numeric strings, all of which must be rejected so the API contract stays
 * explicit. Constraints are chained before `.nullable().optional()`; an
 * optional wrapped the other way around would skip validation for defined
 * values.
 */
export const productCostSchema = z
  .number()
  .nonnegative('cost must be >= 0')
  .max(MAX_PRODUCT_COST, 'cost exceeds the maximum allowed value')
  .refine((value) => COST_SCALE.test(String(value)), {
    message: 'cost must have at most two decimal places'
  })
  .nullable()
  .optional();

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: optionalText(5000),
    basePrice: z.coerce.number().nonnegative('basePrice must be >= 0'),
    cost: productCostSchema,
    currencyCode: currencyCodeSchema,
    status: recordStatusSchema.optional()
  })
  .strict();

/**
 * Derived with `.partial()` on purpose: `partial()` PRESERVES `.strict()`, so
 * an unknown field is still rejected on a PATCH. Redefining this schema by hand
 * would silently lose that. Deriving also keeps the update semantics explicit:
 * an omitted `cost` leaves the stored value untouched (the key is absent from
 * the parsed body) while `cost: null` clears it (the key is present and null).
 */
export const updateProductSchema = createProductSchema.partial();

// --- Marketplaces ----------------------------------------------------------

export const createMarketplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    code: z.enum(['amazon', 'mercadolibre', 'own_store']),
    config: z.record(z.any()).optional().nullable(),
    status: recordStatusSchema.optional()
  })
  .strict();

export const updateMarketplaceSchema = createMarketplaceSchema.partial();

// --- Price lists -----------------------------------------------------------

export const createPriceListSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: optionalText(255),
    currencyCode: currencyCodeSchema.optional().nullable(),
    status: recordStatusSchema.optional()
  })
  .strict();

export const updatePriceListSchema = createPriceListSchema.partial();

export const setRelationsSchema = z
  .object({
    ids: z.array(z.string().uuid())
  })
  .strict();

// --- Prices ----------------------------------------------------------------

export const createPriceSchema = z
  .object({
    productId: z.string().uuid(),
    priceListId: z.string().uuid(),
    marketplaceId: z.string().uuid(),
    basePrice: z.coerce.number().nonnegative('basePrice must be >= 0'),
    currencyCode: currencyCodeSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional().nullable(),
    status: recordStatusSchema.optional(),
    notes: optionalText(2000)
  })
  .strict()
  .superRefine(withValidDateRange);

/** References are immutable after creation: only value fields can change. */
export const updatePriceSchema = z
  .object({
    basePrice: z.coerce.number().nonnegative().optional(),
    currencyCode: currencyCodeSchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional().nullable(),
    status: recordStatusSchema.optional(),
    notes: optionalText(2000)
  })
  .strict()
  .superRefine(withValidDateRange);

export const calculatePriceSchema = z
  .object({
    productId: z.string().uuid(),
    priceListId: z.string().uuid(),
    marketplaceId: z.string().uuid(),
    basePrice: z.coerce.number().nonnegative(),
    currencyCode: currencyCodeSchema.optional(),
    at: z.coerce.date().optional()
  })
  .strict();

// --- Discounts -------------------------------------------------------------

const scopeToField: Record<string, string> = {
  product: 'productId',
  price_list: 'priceListId',
  marketplace: 'marketplaceId'
};

export const createDiscountSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    type: z.enum(['percentage', 'fixed']),
    value: z.coerce.number().nonnegative('value must be >= 0'),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']),
    productId: z.string().uuid().optional().nullable(),
    priceListId: z.string().uuid().optional().nullable(),
    marketplaceId: z.string().uuid().optional().nullable(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional().nullable(),
    priority: z.coerce.number().int().nonnegative().optional(),
    status: recordStatusSchema.optional(),
    description: optionalText(2000)
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'percentage discount value must be <= 100'
      });
    }

    // Exactly one scope FK must be set and it must match `appliesTo`.
    for (const [scope, field] of Object.entries(scopeToField)) {
      const value = (data as Record<string, unknown>)[field];
      const isSet = value !== undefined && value !== null;
      if (scope === data.appliesTo && !isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when appliesTo is '${data.appliesTo}'`
        });
      }
      if (scope !== data.appliesTo && isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be empty when appliesTo is '${data.appliesTo}'`
        });
      }
    }

    withValidDateRange(data, ctx);
  });

export const updateDiscountSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    type: z.enum(['percentage', 'fixed']).optional(),
    value: z.coerce.number().nonnegative().optional(),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']).optional(),
    productId: z.string().uuid().optional().nullable(),
    priceListId: z.string().uuid().optional().nullable(),
    marketplaceId: z.string().uuid().optional().nullable(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional().nullable(),
    priority: z.coerce.number().int().nonnegative().optional(),
    status: recordStatusSchema.optional(),
    description: optionalText(2000)
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && data.value !== undefined && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'percentage discount value must be <= 100'
      });
    }

    // When the scope changes, the matching reference is required and the
    // references of the other scopes must be cleared.
    if (data.appliesTo) {
      for (const [scope, field] of Object.entries(scopeToField)) {
        const value = (data as Record<string, unknown>)[field];
        const isSet = value !== undefined && value !== null;
        if (scope === data.appliesTo && !isSet) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when appliesTo is '${data.appliesTo}'`
          });
        }
        if (scope !== data.appliesTo && isSet) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} must be empty when appliesTo is '${data.appliesTo}'`
          });
        }
      }
    }

    withValidDateRange(data, ctx);
  });
