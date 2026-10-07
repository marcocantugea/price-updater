import type { Config } from 'jest';

/**
 * Integration suite: the only one that talks to a real MySQL database.
 *
 * Kept separate from `jest.config.ts` on purpose. The unit suite is fast,
 * deterministic and database-free, and its coverage thresholds measure the
 * application rather than the harness. This suite exists to prove the things a
 * double cannot: that the composite foreign keys, CHECK constraints and unique
 * indexes really behave as the schema claims, and that a multi-statement write
 * rolls back.
 *
 * Run it with `npm run test:integration`, which prepares the test database
 * first. Running `jest --config jest.integration.config.ts` on its own works too,
 * as long as the database has already been migrated and seeded.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.int.spec.ts'],
  setupFiles: ['<rootDir>/tests/setup.integration.ts'],
  clearMocks: true,
  // The specs share a single database and reset their own data, so running them
  // in parallel would make failures depend on timing.
  maxWorkers: 1,
  // Applying migrations and seeding is slower than an in-memory test.
  testTimeout: 60000,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          strict: false,
          types: ['node', 'jest']
        }
      }
    ]
  }
};

export default config;
