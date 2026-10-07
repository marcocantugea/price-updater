import { Router } from 'express';
import { asyncHandler } from '../common/utils/async-handler';

/** Health check validating both the API process and the database connection. */
export function createHealthRouter(prisma: any, version = '1.0.0'): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      let db: 'up' | 'down' = 'up';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        db = 'down';
      }

      const payload = {
        status: db === 'up' ? 'ok' : 'degraded',
        db,
        uptime: Math.round(process.uptime()),
        version,
        timestamp: new Date().toISOString()
      };

      res.status(db === 'up' ? 200 : 503).json(payload);
    })
  );

  return router;
}
