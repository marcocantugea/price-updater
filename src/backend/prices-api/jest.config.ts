import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>/prisma'],
  testMatch: ['**/*.spec.ts'],
  /**
   * The integration suite matches `**\/*.spec.ts` too, and it must never run here.
   * Its specs talk to a real database using `DATABASE_URL`, which in this suite
   * is the developer's own: they create tenants, write rows and delete them. The
   * integration setup refuses to run without `DATABASE_URL_TEST`, but that guard
   * only exists in the integration config, so this exclusion is the real
   * protection. Run them with `npm run test:integration`, which repoints
   * `DATABASE_URL` at the test database first.
   */
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'prisma/seed/**/*.ts',
    '!src/server.ts',
    '!src/types/**/*.ts',
    '!src/di/**/*.ts',
    '!src/routes/**/*.ts',
    '!**/index.ts'
  ],
  coverageThreshold: {
    global: {
      lines: 70,
      statements: 70,
      functions: 70,
      branches: 70
    }
  },
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
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
