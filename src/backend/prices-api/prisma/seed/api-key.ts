import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createDemoApiKey } from './demo/api-key';

/**
 * Separate, on-demand command: `npm run seed:demo-api-key`.
 *
 * `npm run seed` never generates API keys; this command does it explicitly and
 * prints the plaintext key exactly once. Only the hash is stored.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await createDemoApiKey(prisma);

    if (!result) {
      // eslint-disable-next-line no-console
      console.error('Demo company not found. Run `npm run seed` first (with demo seeds enabled).');
      process.exitCode = 1;
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\nDevelopment API key generated (read-only scopes):');
    // eslint-disable-next-line no-console
    console.log(`  name   : ${result.name}`);
    // eslint-disable-next-line no-console
    console.log(`  scopes : ${result.scopes.join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(`  key    : ${result.plaintextKey}`);
    // eslint-disable-next-line no-console
    console.log('\nCopy it now — it is shown only once and only its hash is persisted.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
