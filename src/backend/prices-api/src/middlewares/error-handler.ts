import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError, type ErrorDetail } from '../common/errors';
import { logger } from '../common/logger';
import { env } from '../config/env';
import { zodDetails } from './validate';
import type { RequestContext } from '../types';

export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
  traceId?: string;
  timestamp: string;
  stack?: string;
}

/** Terminates unmatched routes with the standard envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Single place where every error becomes an HTTP response. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const context = req as RequestContext;
  const traceId = context.requestId;
  const timestamp = new Date().toISOString();

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Unexpected error';
  let details: ErrorEnvelope['details'];
  let logLevel: 'warn' | 'error' = 'error';

  if (error instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input';
    details = zodDetails(error);
    logLevel = 'warn';
  } else if (error instanceof SyntaxError && 'body' in (error as unknown as Record<string, unknown>)) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON body';
    logLevel = 'warn';
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
    logLevel = error.statusCode >= 500 ? 'error' : 'warn';
  } else if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002') {
    statusCode = 409;
    code = 'UNIQUE_CONSTRAINT';
    message = 'A record with the same unique value already exists';
    logLevel = 'warn';
  } else if (error instanceof Error) {
    message = env.isProduction ? 'Unexpected error' : error.message;
  }

  const logPayload = {
    err: error,
    traceId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code
  };

  if (logLevel === 'warn') {
    logger.warn(logPayload, 'request_rejected');
  } else {
    logger.error(logPayload, 'request_failed');
  }

  const envelope: ErrorEnvelope = { statusCode, code, message, details, traceId, timestamp };

  if (!env.isProduction && error instanceof Error && error.stack) {
    envelope.stack = error.stack;
  }

  res.status(statusCode).json(envelope);
}
