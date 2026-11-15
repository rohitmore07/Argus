import IORedis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let sharedClient: IORedis | null = null;
let redisConnected = false;
let redisLastError: string | null = null;

export function createRedisConnection(urlOverride?: string): IORedis | null {
  const url = urlOverride || env.REDIS_URL;
  if (!url) {
    redisLastError = 'REDIS_URL is not configured';
    return null;
  }

  const client = new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) {
        logger.warn('Redis retry limit reached; stopping automatic reconnect attempts');
        return null;
      }
      return Math.min(times * 500, 3000);
    },
  });

  client.on('ready', () => {
    redisConnected = true;
    redisLastError = null;
    logger.info('Redis connection ready');
  });

  client.on('error', (err) => {
    redisConnected = false;
    redisLastError = err.message;
    logger.warn('Redis connection error', { error: err.message });
  });

  client.on('close', () => {
    redisConnected = false;
  });

  return client;
}

export async function initRedis(): Promise<IORedis | null> {
  if (sharedClient) return sharedClient;
  const client = createRedisConnection();
  if (!client) {
    logger.warn('REDIS_URL not configured. BullMQ background worker disabled until Redis is connected.');
    return null;
  }

  try {
    await client.connect();
    await client.ping();
    sharedClient = client;
    redisConnected = true;
    redisLastError = null;
    return sharedClient;
  } catch (err) {
    redisConnected = false;
    redisLastError = err instanceof Error ? err.message : String(err);
    logger.warn('Could not connect to Redis at startup', { error: redisLastError });
    try {
      client.disconnect();
    } catch {
      // ignore
    }
    return null;
  }
}

export function getRedisClient(): IORedis | null {
  return sharedClient;
}

export function getRedisStatus(): {
  connected: boolean;
  configured: boolean;
  error: string | null;
} {
  return {
    connected: redisConnected && sharedClient?.status === 'ready',
    configured: env.isRedisConfigured,
    error: redisConnected ? null : redisLastError,
  };
}

export async function closeRedis(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.quit();
    } catch {
      sharedClient.disconnect();
    }
    sharedClient = null;
    redisConnected = false;
  }
}
