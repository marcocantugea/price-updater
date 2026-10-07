import { Router } from 'express';
import { createAdminRouter } from './admin.routes';
import { createAuthRouter } from './auth.routes';
import { createExternalRouter } from './external.routes';
import { createHealthRouter } from './health.routes';

/** Mounts every route group under /api/v1. */
export function createApiRouter(prisma: any): Router {
  const router = Router();

  router.use('/health', createHealthRouter(prisma));
  router.use('/auth', createAuthRouter());
  router.use('/external', createExternalRouter());
  router.use('/', createAdminRouter());

  return router;
}
