import 'dotenv/config';

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const nodeEnv = str('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: num('PORT', 3000),

  databaseUrl: str('DATABASE_URL', 'mysql://root@127.0.0.1:3306/pricesgrid'),

  jwt: {
    accessSecret: str('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: str('JWT_ACCESS_TTL', '15m'),
    refreshTtlDays: num('JWT_REFRESH_TTL_DAYS', 7)
  },

  apiKeyHashSecret: str('API_KEY_HASH_SECRET', 'dev-api-key-hash-secret-change-me'),

  corsOrigin: str('CORS_ORIGIN', 'http://localhost:4200'),

  logLevel: str('LOG_LEVEL', 'info'),

  exports: {
    directory: str('EXPORT_DIRECTORY', 'storage/exports'),
    retentionHours: num('EXPORT_RETENTION_HOURS', 24),
    workerIntervalMs: num('EXPORT_WORKER_INTERVAL_MS', 2000)
  },

  /**
   * Demo seeds (company, demo users, catalog demo data) are only allowed in
   * development, or when ALLOW_DEMO_SEED is explicitly true.
   */
  allowDemoSeed: bool('ALLOW_DEMO_SEED', nodeEnv === 'development') || nodeEnv === 'development',

  seed: {
    globalAdminEmail: str('SEED_GLOBAL_ADMIN_EMAIL', 'global.admin@pricesgrid.local'),
    globalAdminPassword: str('SEED_GLOBAL_ADMIN_PASSWORD', 'ChangeMe!123'),
    tenantAdminEmail: str('SEED_TENANT_ADMIN_EMAIL', 'tenant.admin@pricesgrid.local'),
    tenantAdminPassword: str('SEED_TENANT_ADMIN_PASSWORD', 'ChangeMe!123')
  },

  cookie: {
    name: 'pg_refresh_token',
    /** SameSite=Lax locally; override with COOKIE_SAMESITE in cross-site deployments. */
    sameSite: str('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
    /** Secure cookies require HTTPS; auto-enabled in production. */
    secure: bool('COOKIE_SECURE', nodeEnv === 'production')
  }
};

export type Env = typeof env;
