import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { logger } from './common/logger';
import { buildContainer } from './di/container';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();

  buildContainer(prisma);

  const app = createApp(prisma);
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'api_started');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'api_shutdown_started');
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
