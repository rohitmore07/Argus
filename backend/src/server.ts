import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { closeRedis, initRedis } from './config/redis';
import { closeReviewQueue, initReviewQueue } from './queues/reviewQueue';
import { startReviewWorker, stopReviewWorker } from './jobs/reviewWorker';
import { logger } from './utils/logger';

async function bootstrap() {
  // 1. Connect MongoDB Atlas (Mongoose ODM)
  await connectDatabase();

  // 2. Initialize Redis, BullMQ Queue, and BullMQ Worker
  const redis = await initRedis();
  if (redis) {
    await initReviewQueue();
    await startReviewWorker();
  }

  // 3. Start Express HTTP server bound to 0.0.0.0
  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`PR Sentinel backend listening on http://0.0.0.0:${env.PORT}`, {
      env: env.NODE_ENV,
      port: env.PORT,
    });
  });

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}; shutting down PR Sentinel backend gracefully`);
    server.close(async () => {
      await stopReviewWorker();
      await closeReviewQueue();
      await closeRedis();
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal error during backend bootstrap', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
