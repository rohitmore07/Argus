import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import apiRoutes from './routes';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow server-to-server, proxied same-origin, or explicitly configured frontend origin
        if (!origin) return callback(null, true);
        const allowed = [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://argus-agent-frontend.vercel.app'];
        if (allowed.includes(origin) || /\.e2b\.app$/.test(new URL(origin).hostname)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    })
  );

  // Capture raw request body bytes for exact GitHub HMAC-SHA256 webhook signature verification
  app.use(
    express.json({
      limit: '5mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        if (req.originalUrl.startsWith('/api/webhooks/github')) {
          req.rawBody = buf;
        }
      },
    })
  );

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Apply general API rate limiter to all API routes except webhooks (which have their own limiter)
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/webhooks')) {
      return next();
    }
    return apiRateLimiter(req, res, next);
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'PR Sentinel API',
      version: '1.0.0',
      health: '/api/health',
    });
  });

  app.use('/api', apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
