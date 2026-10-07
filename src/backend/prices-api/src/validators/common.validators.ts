import { z } from 'zod';
import { isDateOnlyValue, isValidTimeZone } from '../common/utils/business-date';

export const recordStatusSchema = z.enum(['active', 'inactive']);

export const uuidSchema = z.string().uuid('must be a valid UUID');

export const idParamSchema = z.object({
  id: uuidSchema
});

/** Query params accepted by every list endpoint (filters pass through). */
export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().max(200).optional(),
    status: z.string().max(40).optional(),
    sort: z.string().max(60).optional(),
    order: z.enum(['asc', 'desc']).optional()
  })
  .passthrough();

export const currencyCodeSchema = z
  .string()
  .trim()
  .length(3, 'currency code must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());

export const optionalText = (max: number) =>
  z.string().max(max).optional().nullable();

/** Parses a calendar date without allowing an implicit browser/server offset. */
export const dateOnlySchema = z.string().refine(isDateOnlyValue, {
  message: 'date must use the YYYY-MM-DD format'
}).transform((value) => new Date(`${value}T00:00:00.000Z`));

export const timeZoneSchema = z.string().trim().min(1).max(64).refine(isValidTimeZone, {
  message: 'timeZone must be a valid IANA time-zone identifier'
});

/** Rejects an end date before the start date; the same calendar day is valid. */
export function withValidDateRange<T extends { startDate?: Date | null; endDate?: Date | null }>(
  data: T,
  ctx: z.RefinementCtx
): void {
  if (data.startDate && data.endDate && data.endDate.getTime() < data.startDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be after startDate'
    });
  }
}
