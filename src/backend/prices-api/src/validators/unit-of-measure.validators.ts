import { z } from 'zod';
import { EMPTY_UPDATE_BODY, UNIT_CODE_FORMAT } from '../common/errors/unit-error-codes';
import { recordStatusSchema } from './common.validators';

/**
 * Contract for the global unit-of-measure catalog (TEC-43).
 *
 * ## The code pattern is a product contract
 *
 * Business tables reference `code` through foreign keys instead of the row id,
 * so it is a permanent, public identifier: it travels in API payloads and
 * exports, and the UI translates its label by code. The pattern keeps it
 * addressable and unambiguous:
 *
 *     ^[A-Z0-9][A-Z0-9_-]{0,7}$     (after trim + uppercase)
 *
 * 1–8 characters — the column width and the same limit the specification
 * payload already applies to `unitCode` — starting with a letter or a digit,
 * then letters, digits, `_` or `-`. `KG`, `M2`, `2L` and `PACK_12` are valid;
 * whitespace, accents, `.`, `/` and `#` are not. Input is uppercased because
 * MySQL compares the unique code case-insensitively, so `kg` and `KG` would
 * otherwise collide as an incomprehensible duplicate error.
 *
 * `decimals` is a real JSON number on purpose: coercing it would turn a cleared
 * form control (`''`) into `0`, silently tightening every future value.
 */

export const UNIT_DIMENSIONS = ['count', 'mass', 'length'] as const;

export const UNIT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,7}$/;

export const unitCodeSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(8, 'must be at most 8 characters')
  .transform((value) => value.toUpperCase())
  .superRefine((value, ctx) => {
    if (UNIT_CODE_PATTERN.test(value)) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      params: { code: UNIT_CODE_FORMAT },
      message: 'use 1-8 characters: letters, digits, underscore or hyphen, starting with a letter or a digit'
    });
  });

export const createUnitOfMeasureSchema = z
  .object({
    code: unitCodeSchema,
    name: z.string().trim().min(1, 'is required').max(100),
    symbol: z.string().trim().min(1, 'is required').max(10),
    dimension: z.enum(UNIT_DIMENSIONS),
    // `0..3` is the scale the database itself stores (`DECIMAL(12,3)`).
    decimals: z.number().int('must be a whole number').min(0).max(3),
    // Explicit default so the response never depends on the database default.
    status: recordStatusSchema.optional().default('active')
  })
  .strict();

/**
 * Partial update. Strictness (unknown keys rejected) is preserved by
 * `partial()`, and an empty body is refused rather than silently rewriting the
 * audit columns of an untouched row.
 */
export const updateUnitOfMeasureSchema = createUnitOfMeasureSchema
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length > 0) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      params: { code: EMPTY_UPDATE_BODY },
      message: 'at least one field is required'
    });
  });

export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>;
export type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>;
