import { z } from 'zod';
import { uuidSchema } from './common.validators';

/**
 * Validation for the product-specification aggregate (the full-replacement PUT).
 *
 * ## Which layer owns which error code
 *
 * This layer owns **shape and format**: strict bodies, the documented limits,
 * strictly positive measurements at the column precision, the value/unit pair
 * rule, and identifier length/digit composition.
 *
 * It deliberately does NOT own the four specific 422 codes of the API contract,
 * nor the 409. Blocking reasons:
 *
 * | Code | Why it cannot live here |
 * | --- | --- |
 * | `UNIT_DIMENSION_MISMATCH` | needs the global unit catalog (database) |
 * | `DUPLICATE_PRESENTATION` | needs the product's existing active rows |
 * | `INVALID_CHILD_REFERENCE` | needs ownership of the referenced children |
 * | `INVALID_IDENTIFIER_CHECKSUM` | kept with the three above so the whole contract sits in one place |
 * | `IDENTIFIER_ALREADY_EXISTS` | needs the tenant-wide GTIN-14 uniqueness check |
 *
 * All five live together in the domain service, which throws them with the same
 * nested `details[].field` paths this layer produces. The frontend therefore
 * binds errors identically regardless of which layer rejected the request, and
 * the top-level `error.code` stays the specific code from the contract table.
 *
 * ## Full replacement, not patch
 *
 * Every top-level key is required. Omitting a key is not "leave it alone": the
 * PUT replaces the whole aggregate. This is deliberate — the repository already
 * learned this lesson with the optional product `cost`, where an omitted field
 * was indistinguishable from "clear it". A client that wants to clear a brand
 * sends `"brandId": null`, and one that wants no suppliers sends `[]`.
 */

export const MAX_PRESENTATIONS_PER_PRODUCT = 50;
export const MAX_IDENTIFIERS_PER_PRESENTATION = 20;
export const MAX_SUPPLIERS_PER_PRODUCT = 100;

/**
 * A captured measurement. Strictly positive, and expressible in `DECIMAL(12,3)`:
 * at most nine integer digits and at most three decimals. Checking the precision
 * here turns a silent MySQL rounding (or a range error at write time) into a
 * field-level 422.
 */
const capturedValueSchema = z
  .number()
  .finite()
  .gt(0, 'must be greater than zero')
  .max(999999999.999, 'exceeds the supported range')
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'supports at most 3 decimal places'
  });

const unitCodeSchema = z.string().trim().min(1, 'is required').max(8);

/** `null` clears the measurement. An object always carries value AND unit. */
const measurementSchema = z
  .object({
    value: capturedValueSchema,
    unitCode: unitCodeSchema
  })
  .strict()
  .nullable();

const identifierSchema = z
  .object({
    /** Omitted creates a new row; present must be an existing row of this product. */
    id: uuidSchema.optional(),
    type: z.enum(['ean_8', 'ean_13', 'upc_a', 'upc_e']),
    // Length is checked per symbology by the service; the upper bound here just
    // keeps the column's VARCHAR(14) honest.
    value: z.string().trim().min(1, 'is required').max(14)
  })
  .strict();

const presentationSchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().trim().min(1, 'is required').max(150),
    quantity: capturedValueSchema,
    unitCode: unitCodeSchema,
    // Omitted means "no identifiers", which is the replacement semantic.
    identifiers: z.array(identifierSchema).max(MAX_IDENTIFIERS_PER_PRESENTATION).default([])
  })
  .strict();

export const productSpecificationParamsSchema = z
  .object({
    productId: uuidSchema
  })
  .strict();

export const replaceProductSpecificationSchema = z
  .object({
    brandId: uuidSchema.nullable(),
    model: z.string().trim().max(150).nullable(),
    measurements: z
      .object({
        weight: measurementSchema.optional(),
        length: measurementSchema.optional(),
        depth: measurementSchema.optional()
      })
      .strict(),
    presentations: z.array(presentationSchema).max(MAX_PRESENTATIONS_PER_PRODUCT),
    supplierIds: z.array(uuidSchema).max(MAX_SUPPLIERS_PER_PRODUCT)
  })
  .strict()
  .superRefine((payload, ctx) => {
    // Structural only: a client that sends the same child id twice is malformed.
    // Duplicate *names* and duplicate *barcodes* are domain rules and belong to
    // the service, which can also see the rows already stored.
    const seenPresentationIds = new Set<string>();

    payload.presentations.forEach((presentation, presentationIndex) => {
      if (presentation.id) {
        if (seenPresentationIds.has(presentation.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['presentations', presentationIndex, 'id'],
            message: 'duplicate presentation id'
          });
        }
        seenPresentationIds.add(presentation.id);
      }

      const seenIdentifierIds = new Set<string>();

      presentation.identifiers.forEach((identifier, identifierIndex) => {
        if (!identifier.id) return;

        if (seenIdentifierIds.has(identifier.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['presentations', presentationIndex, 'identifiers', identifierIndex, 'id'],
            message: 'duplicate identifier id'
          });
        }
        seenIdentifierIds.add(identifier.id);
      });
    });

    const seenSupplierIds = new Set<string>();

    payload.supplierIds.forEach((supplierId, index) => {
      if (seenSupplierIds.has(supplierId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['supplierIds', index],
          message: 'duplicate supplier id'
        });
      }
      seenSupplierIds.add(supplierId);
    });
  });

export type ReplaceProductSpecificationInput = z.infer<typeof replaceProductSpecificationSchema>;
export type PresentationInput = z.infer<typeof presentationSchema>;
export type IdentifierInput = z.infer<typeof identifierSchema>;
export type MeasurementInput = z.infer<typeof measurementSchema>;
