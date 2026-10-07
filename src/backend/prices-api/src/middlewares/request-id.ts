import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestContext } from '../types';

/** Attaches a correlation id used for tracing across logs and responses. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.trim() !== '' ? incoming.trim() : randomUUID();
  (req as RequestContext).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
