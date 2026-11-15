import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { createRedisConnection } from '../config/redis';
import { REVIEW_QUEUE_NAME } from '../queues/reviewQueue';
import { executeReviewJob } from '../services/reviewService';
import { ReviewJobPayload } from '../types';
import { logger } from '../utils/logger';

let workerConnection: IORedis | null = null;
let reviewWorker: Worker<ReviewJobPayload> | null = null;

export async function startReviewWorker(): Promise<Worker<ReviewJobPayload> | null> {
  if (reviewWorker) return reviewWorker;

  const conn = createRedisConnection();
  if (!conn) return null;

  try {
    await conn.connect();
    await conn.ping();
    workerConnection = conn;

    reviewWorker = new Worker<ReviewJobPayload>(
      REVIEW_QUEUE_NAME,
      async (job: Job<ReviewJobPayload>) => {
        logger.info('BullMQ worker picked up PR review job', {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          pullRequestId: job.data.pullRequestId,
          headSha: job.data.headSha.slice(0, 7),
        });
        await executeReviewJob(job.data);
      },
      {
        connection: conn,
        concurrency: env.REVIEW_WORKER_CONCURRENCY,
        lockDuration: 300_000, // 5 min lock for large multi-batch PR reviews
      }
    );

    reviewWorker.on('completed', (job) => {
      logger.info('BullMQ PR review job completed', {
        jobId: job.id,
        pullRequestId: job.data.pullRequestId,
      });
    });

    reviewWorker.on('failed', (job, err) => {
      logger.error('BullMQ PR review job failed', {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        error: err.message,
      });
    });

    reviewWorker.on('error', (err) => {
      logger.warn('BullMQ worker runtime error', { error: err.message });
    });

    logger.info('BullMQ review worker started', {
      queue: REVIEW_QUEUE_NAME,
      concurrency: env.REVIEW_WORKER_CONCURRENCY,
    });
    return reviewWorker;
  } catch (err) {
    logger.warn('Could not start BullMQ review worker', {
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      conn.disconnect();
    } catch {
      // ignore
    }
    return null;
  }
}

export async function stopReviewWorker(): Promise<void> {
  if (reviewWorker) {
    await reviewWorker.close().catch(() => undefined);
    reviewWorker = null;
  }
  if (workerConnection) {
    await workerConnection.quit().catch(() => workerConnection?.disconnect());
    workerConnection = null;
  }
}
