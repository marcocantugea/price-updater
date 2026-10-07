import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { buildContainer } from './di/container';
import { TOKENS } from './di/tokens';
import type { ExportService } from './services/export.service';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaClient();
  const container = buildContainer(prisma);
  const service = container.resolve<ExportService>(TOKENS.ExportService);
  const workerId = `exports-${randomUUID()}`;
  let stopping = false;

  const stop = (): void => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  while (!stopping) {
    await service.processPending(workerId);
    await new Promise((resolve) => setTimeout(resolve, env.exports.workerIntervalMs));
  }

  await prisma.$disconnect();
}

void bootstrap();
