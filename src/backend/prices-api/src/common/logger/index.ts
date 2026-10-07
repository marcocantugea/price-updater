import pino from 'pino';
import { env } from '../../config/env';

/**
 * Structured JSON logger writing to stdout/stderr (no manual file persistence,
 * ready for an external collector). Sensitive values are redacted.
 */
export const logger = pino({
  level: env.logLevel,
  base: { service: 'prices-api', env: env.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.tokenHash',
      '*.key',
      '*.apiKey',
      '*.keyHash',
      '*.secret',
      '*.email'
    ],
    censor: '[REDACTED]'
  }
});

export type Logger = typeof logger;
