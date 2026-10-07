#!/usr/bin/env node
/**
 * Driver for the integration suite.
 *
 * One command has to do three things in order, because each depends on the
 * previous one and none of them is safe to forget:
 *
 *   1. apply the migrations to the **test** database,
 *   2. load the seeds into it,
 *   3. run the suite against it.
 *
 * Doing this in a script rather than in an npm-script chain keeps the test
 * database URL in exactly one place and makes the ordering explicit. `prisma db
 * seed` in particular would otherwise inherit the application's `DATABASE_URL`.
 *
 * Spawned with `stdio: 'inherit'` so migration and seed output — including any
 * failure — reaches the terminal unbuffered.
 *
 * Usage: `npm run test:integration`. `.env` is loaded here rather than through
 * `node --env-file`, which keeps the script working on older Node versions and
 * matches how the application itself reads its configuration.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

loadEnv({ path: resolve(packageRoot, '.env') });

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl || testDatabaseUrl.trim() === '') {
  console.error(
    '[integration] DATABASE_URL_TEST is not set.\n' +
      '  Add it to .env (see .env.example) and point it at a database dedicated to\n' +
      '  tests. This suite applies migrations and writes rows, so it must not run\n' +
      '  against the database you develop with.'
  );
  process.exit(1);
}

const prismaCli = resolve(packageRoot, 'node_modules/prisma/build/index.js');
const jestCli = resolve(packageRoot, 'node_modules/jest/bin/jest.js');

/**
 * `--prepare-only` stops after migrating and seeding.
 *
 * The end-to-end suite needs the same prepared database but is run by Playwright
 * from the frontend package, so the preparation has to be reachable on its own
 * (`npm run db:test:prepare`) instead of only as part of this driver.
 */
const prepareOnly = process.argv.includes('--prepare-only');

function run(label, args, env) {
  console.log(`\n[integration] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });

  if (result.error) {
    console.error(`[integration] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[integration] ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

// The test database is redeployed from scratch every run: `migrate deploy` is
// additive and idempotent, and the seeds upsert, so a previous run cannot leak
// state into this one.
run('applying migrations to the test database', [prismaCli, 'migrate', 'deploy'], {
  DATABASE_URL: testDatabaseUrl
});

run('loading seeds into the test database', [prismaCli, 'db', 'seed'], {
  DATABASE_URL: testDatabaseUrl,
  ALLOW_DEMO_SEED: 'true'
});

if (prepareOnly) {
  console.log('\n[integration] test database ready (--prepare-only, suite not run).');
  process.exit(0);
}

run('running the integration suite', [jestCli, '--config', 'jest.integration.config.ts'], {
  DATABASE_URL_TEST: testDatabaseUrl
});
