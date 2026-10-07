import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Environment for the end-to-end suite.
 *
 * The journey drives the real UI against the real API and a real database, so it
 * needs three things that must not be hardcoded in a spec: the test database, and
 * the credentials the seeds created. All three come from the backend's `.env`,
 * which is the same file the seeds and the API read.
 *
 * The database is deliberately `DATABASE_URL_TEST` and never `DATABASE_URL`: the
 * journey creates products and captures specifications, so pointing it at the
 * development database would write into a developer's data.
 */
export const frontendRoot = resolve(__dirname, '..');
export const backendRoot = resolve(frontendRoot, '../../backend/prices-api');

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const values: Record<string, string> = {};

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const backendEnv = readEnvFile(resolve(backendRoot, '.env'));

export const apiUrl = process.env.E2E_API_URL ?? `http://127.0.0.1:${backendEnv.PORT ?? '3000'}/api/v1`;
export const webUrl = process.env.E2E_WEB_URL ?? 'http://localhost:4200';

export const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? backendEnv.DATABASE_URL_TEST ?? '';

export const tenantAdmin = {
  email: process.env.E2E_ADMIN_EMAIL ?? backendEnv.SEED_TENANT_ADMIN_EMAIL ?? '',
  password: process.env.E2E_ADMIN_PASSWORD ?? backendEnv.SEED_TENANT_ADMIN_PASSWORD ?? ''
};

/**
 * The seeded global administrator, needed by the journeys that administer a
 * global catalog (units of measure). The fallbacks mirror `src/config/env.ts`,
 * which is what the seeds themselves used to create the account.
 */
export const globalAdmin = {
  email:
    process.env.E2E_GLOBAL_ADMIN_EMAIL ??
    backendEnv.SEED_GLOBAL_ADMIN_EMAIL ??
    'global.admin@pricesgrid.local',
  password:
    process.env.E2E_GLOBAL_ADMIN_PASSWORD ??
    backendEnv.SEED_GLOBAL_ADMIN_PASSWORD ??
    'ChangeMe!123'
};

/**
 * Fails before a single browser starts when the environment is incomplete.
 *
 * Without this the suite would fail deep inside a test with a misleading
 * symptom — a login that never redirects, or a 500 from an API pointed at a
 * database that has no schema.
 */
export function assertE2EEnvironment(): void {
  if (testDatabaseUrl.trim() === '') {
    throw new Error(
      `DATABASE_URL_TEST is not set.\n` +
        `  The end-to-end suite drives the real API against a real database, so it\n` +
        `  needs the dedicated test database. Add DATABASE_URL_TEST to\n` +
        `  ${resolve(backendRoot, '.env')} (see .env.example) and run\n` +
        `  \`npm run db:test:prepare\` in the backend package.`
    );
  }

  if (tenantAdmin.email.trim() === '' || tenantAdmin.password.trim() === '') {
    throw new Error(
      'The seeded tenant-admin credentials are missing.\n' +
        '  Set SEED_TENANT_ADMIN_EMAIL and SEED_TENANT_ADMIN_PASSWORD in the backend\n' +
        '  .env: the seeds read them, and the journey signs in with them.'
    );
  }
}
