import { defineConfig, devices } from '@playwright/test';
import { apiUrl, assertE2EEnvironment, backendRoot, frontendRoot, testDatabaseUrl } from './e2e/env';

/**
 * End-to-end configuration.
 *
 * The suite starts both halves of the application itself, so a single
 * `npm run e2e` is the whole gate: no one has to remember to boot the API and the
 * dev server in two other terminals, and CI gets the same behaviour.
 *
 * Preconditions, checked here rather than discovered mid-test:
 *
 *   1. `DATABASE_URL_TEST` points at the dedicated test database,
 *   2. that database has been migrated and seeded (`npm run db:test:prepare` in
 *      the backend package).
 *
 * The browser is the system Chrome via `channel: 'chrome'`, which avoids a
 * ~150 MB browser download for a gate that runs on a developer machine that
 * already has one.
 */
assertE2EEnvironment();

const apiPort = new URL(apiUrl).port || '3000';
const webPort = new URL(
  process.env.E2E_WEB_URL ?? 'http://localhost:4200'
).port || '4200';

/** The API only needs to reach MySQL; every other secret is irrelevant here. */
const apiEnvironment: Record<string, string> = {
  ...(process.env as Record<string, string>),
  NODE_ENV: 'test',
  PORT: apiPort,
  DATABASE_URL: testDatabaseUrl,
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn'
};

export default defineConfig({
  testDir: './e2e',
  // The journey is stateful: it captures a specification and then edits it. Tests
  // inside a file run in order, and one worker keeps two journeys from
  // interleaving against the same backend.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',

  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The application ships `es-419` first, so the journey asserts the copy a
    // Spanish-speaking user actually sees.
    locale: 'es-419',
    timezoneId: 'America/Mexico_City'
  },

  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    // The page has to be usable on a phone, which is the part of §10 that unit
    // tests cannot check: the layout and the tap targets only exist at a real
    // viewport.
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'], channel: 'chrome' } }
  ],

  webServer: [
    {
      command: 'npm run dev',
      cwd: backendRoot,
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: apiEnvironment
    },
    {
      command: `npm start -- --port ${webPort}`,
      cwd: frontendRoot,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        ...(process.env as Record<string, string>),
        // Keep the dev server from opening a browser window on every run.
        NG_CLI_ANALYTICS: 'false',
        BROWSER: 'none'
      }
    }
  ]
});
