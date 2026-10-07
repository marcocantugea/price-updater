/**
 * Domain error hierarchy. Controllers/services throw these; the centralized
 * error-handler middleware maps them to the HTTP error envelope.
 */

/**
 * Machine-readable field detail.
 *
 * `code` and `params` exist so the frontend can localize the message instead of
 * rendering the English prose in `message`. `message` is kept as the technical
 * fallback for non-UI consumers and for codes the frontend does not know yet.
 */
export interface ErrorDetail {
  field?: string;
  code?: string;
  message: string;
  params?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  constructor(message: string, statusCode: number, code: string, details?: ErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

/**
 * 422 by default.
 *
 * `code` is the **third** parameter, not the second, so every existing
 * `new ValidationError(message, details)` call site keeps working unchanged.
 * It exists so a specific, localizable condition can carry its own
 * machine-readable code instead of collapsing into the generic
 * `VALIDATION_ERROR`: the product-specification aggregate needs
 * `INVALID_IDENTIFIER_CHECKSUM`, `UNIT_DIMENSION_MISMATCH`,
 * `DUPLICATE_PRESENTATION`, and `INVALID_CHILD_REFERENCE`.
 *
 * The top-level `code` is what the screen-level banner and the tests assert;
 * per-field problems keep travelling in `details[]`.
 */
export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: ErrorDetail[], code = 'VALIDATION_ERROR') {
    super(message, 422, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 409 by default.
 *
 * `code` already carried the specific reason before this change (the repository
 * uses `EMAIL_ALREADY_EXISTS`, `ROLE_SLUG_TAKEN`, and `DISCOUNT_NAME_TAKEN`).
 * `details` is new: `IDENTIFIER_ALREADY_EXISTS` must be able to say *which*
 * field or identifier collided, so the form can bind the message to the right
 * row instead of showing a screen-level banner for a problem in one cell.
 */
export class ConflictError extends AppError {
  constructor(
    message = 'Resource already exists',
    code = 'CONFLICT',
    details?: ErrorDetail[]
  ) {
    super(message, 409, code, details);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}
