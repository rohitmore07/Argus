import { Queue, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection } from '../config/redis';
import { ReviewJobPayload } from '../types';
import { ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';

export const REVIEW_QUEUE_NAME = 'pr-sentinel-reviews';

let queueConnection: IORedis | null = null;
let reviewQueue: Queue<ReviewJobPayload> | null = null;

export async function initReviewQueue(): Promise<Queue<ReviewJobPayload> | null> {
  if (reviewQueue) return reviewQueue;

  const conn = createRedisConnection();
  if (!conn) return null;

  try {
    await conn.connect();
    await conn.ping();
    queueConnection = conn;

    reviewQueue = new Queue<ReviewJobPayload>(REVIEW_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 500,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
          count: 500,
        },
      },
    });

    logger.info('BullMQ review queue initialized', { queue: REVIEW_QUEUE_NAME });
    return reviewQueue;
  } catch (err) {
    logger.warn('Failed to initialize BullMQ review queue', {
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

export function getReviewQueue(): Queue<ReviewJobPayload> | null {
  return reviewQueue;
}

/**
 * Enqueues a Pull Request review job into BullMQ with deterministic jobId deduplication
 * so duplicate webhook deliveries for the same commit never spawn parallel duplicate jobs.
 */
export async function enqueueReviewJob(
  payload: ReviewJobPayload,
  options?: JobsOptions
): Promise<{ jobId: string }> {
  const queue = reviewQueue || (await initReviewQueue());
  if (!queue) {
    throw new ServiceUnavailableError(
      'Redis / BullMQ job queue is not connected. Configure REDIS_URL and ensure Redis is running to process PR reviews.'
    );
  }

  const jobId = payload.forceReReview
    ? `review-${payload.pullRequestId}-${payload.headSha}-${Date.now()}`
    : `review-${payload.pullRequestId}-${payload.headSha}`;

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      logger.info('Skipping duplicate BullMQ job enqueue; job already active/waiting', {
        jobId,
        state,
      });
      return { jobId };
    }
    // Remove stale completed/failed job with same ID so re-runs succeed cleanly
    await existing.remove().catch(() => undefined);
  }

  const job = await queue.add('analyze-pull-request', payload, {
    jobId,
    priority: payload.triggerSource === 'manual' ? 1 : 5,
    ...options,
  });

  logger.info('Enqueued PR review job in BullMQ', {
    jobId: job.id,
    pullRequestId: payload.pullRequestId,
    headSha: payload.headSha.slice(0, 7),
    triggerSource: payload.triggerSource,
  });

  return { jobId: String(job.id || jobId) };
}

export async function getQueueMetrics(): Promise<{
  connected: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  if (!reviewQueue) {
    return {
      connected: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  try {
    const counts = await reviewQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed'
    );
    return {
      connected: true,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  } catch {
    return {
      connected: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }
}

export async function closeReviewQueue(): Promise<void> {
  if (reviewQueue) {
    await reviewQueue.close().catch(() => undefined);
    reviewQueue = null;
  }
  if (queueConnection) {
    await queueConnection.quit().catch(() => queueConnection?.disconnect());
    queueConnection = null;
  }
}
