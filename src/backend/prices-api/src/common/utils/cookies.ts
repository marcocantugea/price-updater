import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';

/** Refresh cookies are HttpOnly + Secure, scoped to the auth endpoints. */
export function refreshCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: '/api/v1/auth',
    expires
  };
}

export function setRefreshCookie(res: Response, token: string, expires: Date): void {
  res.cookie(env.cookie.name, token, refreshCookieOptions(expires));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.cookie.name, refreshCookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[env.cookie.name] ?? null;
}
