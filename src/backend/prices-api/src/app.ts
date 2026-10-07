import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './common/logger';
import { requestId } from './middlewares/request-id';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { createApiRouter } from './routes';
import { createHealthRouter } from './routes/health.routes';

/** Builds the Express application (middlewares + routes). */
export function createApp(prisma: any): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(requestId);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as any).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      autoLogging: { ignore: (req) => req.url === '/health' }
    })
  );

  // CORS with credentials so the HttpOnly refresh cookie is sent.
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((origin) => origin.trim()),
      credentials: true
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/health', createHealthRouter(prisma));
  app.use('/api/v1', createApiRouter(prisma));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
