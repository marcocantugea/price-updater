import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodIssue, type ZodTypeAny } from 'zod';
import { ValidationError, type ErrorDetail } from '../common/errors';

export type ValidationSource = 'body' | 'query' | 'params';

/**
 * Stable code per Zod issue kind. The frontend resolves `errors.<CODE>` and
 * interpolates `params`, so a known validation failure never reaches the user
 * as English prose. `message` stays in the envelope as the technical fallback
 * for non-UI consumers and for codes the frontend does not know yet.
 */
export const ZOD_ISSUE_CODES: Record<string, string> = {
  invalid_type: 'INVALID_TYPE',
  invalid_literal: 'INVALID_LITERAL',
  invalid_union: 'INVALID_VALUE',
  invalid_union_discriminator: 'INVALID_VALUE',
  invalid_enum_value: 'UNSUPPORTED_VALUE',
  unrecognized_keys: 'UNKNOWN_FIELD',
  invalid_arguments: 'INVALID_VALUE',
  invalid_return_type: 'INVALID_VALUE',
  invalid_date: 'INVALID_DATE',
  invalid_string: 'INVALID_FORMAT',
  too_small: 'TOO_SMALL',
  too_big: 'TOO_BIG',
  invalid_intersection_types: 'INVALID_VALUE',
  not_multiple_of: 'NOT_MULTIPLE_OF',
  not_finite: 'NOT_FINITE',
  custom: 'INVALID_VALUE'
};

/**
 * A `custom` issue may carry its own stable code through `params.code`
 * (see `localizedIssue`), which wins over the generic mapping.
 */
function zodIssueCode(issue: ZodIssue): string {
  if (issue.code === 'custom') {
    const custom = issue.params?.['code'];
    if (typeof custom === 'string' && custom !== '') return custom;
  }
  return ZOD_ISSUE_CODES[issue.code] ?? 'INVALID_VALUE';
}

/** Parameters the frontend interpolates into the localized message. */
function zodIssueParams(issue: ZodIssue): Record<string, unknown> | undefined {
  switch (issue.code) {
    case 'too_small':
      return { minimum: Number(issue.minimum), inclusive: issue.inclusive, kind: issue.type };
    case 'too_big':
      return { maximum: Number(issue.maximum), inclusive: issue.inclusive, kind: issue.type };
    case 'invalid_enum_value':
      return { allowed: issue.options, received: issue.received };
    case 'unrecognized_keys':
      return { keys: issue.keys };
    case 'invalid_type':
      return { expected: issue.expected, received: issue.received };
    case 'invalid_string':
      return { format: typeof issue.validation === 'string' ? issue.validation : 'pattern' };
    case 'not_multiple_of':
      return { multipleOf: Number(issue.multipleOf) };
    case 'custom': {
      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(issue.params ?? {})) {
        if (key !== 'code') extra[key] = value;
      }
      return Object.keys(extra).length > 0 ? extra : undefined;
    }
    default:
      return undefined;
  }
}

/** Maps a single Zod issue onto a localizable field detail. */
export function zodIssueDetail(issue: ZodIssue): ErrorDetail {
  const detail: ErrorDetail = {
    field: issue.path.join('.') || undefined,
    code: zodIssueCode(issue),
    message: issue.message
  };

  const params = zodIssueParams(issue);
  if (params) detail.params = params;

  return detail;
}

export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map(zodIssueDetail);
}

/**
 * Adds a custom issue carrying a project-specific stable code, so refinements
 * can expose something better than the generic `INVALID_VALUE`.
 */
export function localizedIssue(
  ctx: { addIssue: (issue: ZodIssue) => void },
  input: { path?: (string | number)[]; code: string; message: string; params?: Record<string, unknown> }
): void {
  ctx.addIssue({
    code: 'custom',
    path: input.path ?? [],
    message: input.message,
    params: { code: input.code, ...(input.params ?? {}) }
  } as ZodIssue);
}

/**
 * Validation middleware. Parsed values replace the request body for `body`
 * requests and are exposed as `validatedQuery` for `query` requests.
 */
export function validate(schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse((req as any)[source] ?? {});

    if (!result.success) {
      return next(new ValidationError('Invalid input', zodDetails(result.error)));
    }

    if (source === 'body') {
      req.body = result.data;
    } else if (source === 'query') {
      (req as any).validatedQuery = result.data;
    }

    next();
  };
}
