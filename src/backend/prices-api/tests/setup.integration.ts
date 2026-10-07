import 'reflect-metadata';

/**
 * Setup for the integration suite, which is the only suite that talks to a real
 * MySQL database.
 *
 * `DATABASE_URL` is repointed at `DATABASE_URL_TEST` before any application
 * module is imported, so every `new PrismaClient()` in the code under test
 * connects to the test database. That redirection is the whole safety mechanism:
 * the suite applies migrations, runs the seeds and writes rows, so it must never
 * be able to reach the database a developer is working against.
 *
 * A missing `DATABASE_URL_TEST` aborts the suite loudly instead of falling back
 * to `DATABASE_URL`. Silently testing against the development database would be
 * far worse than not testing at all.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl || testDatabaseUrl.trim() === '') {
  throw new Error(
    'DATABASE_URL_TEST is not set. The integration suite needs its own database: ' +
      'add DATABASE_URL_TEST to .env (see .env.example) and ensure it points at a ' +
      'database dedicated to tests, not the one you develop against.'
  );
}

process.env.DATABASE_URL = testDatabaseUrl;

// The application reads these at import time; the unit setup defines the same
// ones so a spec never depends on a developer's local shell.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.API_KEY_HASH_SECRET = process.env.API_KEY_HASH_SECRET ?? 'test-api-key-secret';
