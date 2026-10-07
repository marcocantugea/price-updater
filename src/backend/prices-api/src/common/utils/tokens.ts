import crypto from 'node:crypto';
import { env } from '../../config/env';

/** Opaque refresh token value stored (hashed) in the DB and delivered in a cookie. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/** Refresh tokens are stored hashed so a DB leak cannot be replayed. */
export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', env.jwt.refreshSecret).update(token).digest('hex');
}

export function refreshTokenExpiry(now: Date = new Date()): Date {
  const expires = new Date(now.getTime());
  expires.setDate(expires.getDate() + env.jwt.refreshTtlDays);
  return expires;
}
