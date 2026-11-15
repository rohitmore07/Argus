import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let isConnected = false;
let lastError: string | null = null;

mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  isConnected = true;
  lastError = null;
  logger.info('MongoDB connected successfully');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  lastError = err instanceof Error ? err.message : String(err);
  logger.error('MongoDB connection error', { error: lastError });
});

export async function connectDatabase(uriOverride?: string): Promise<boolean> {
  const uri = uriOverride || env.MONGODB_URI;
  if (!uri || uri.includes('cluster0.example.mongodb.net')) {
    lastError = 'MONGODB_URI is not configured';
    logger.warn('MongoDB URI not configured. API will run in diagnostic mode until MONGODB_URI is provided.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
    isConnected = mongoose.connection.readyState === 1;
    lastError = null;
    return isConnected;
  } catch (err) {
    isConnected = false;
    lastError = err instanceof Error ? err.message : String(err);
    logger.error('Failed to connect to MongoDB', { error: lastError });
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export function getDatabaseStatus(): {
  connected: boolean;
  configured: boolean;
  readyState: number;
  error: string | null;
} {
  return {
    connected: mongoose.connection.readyState === 1,
    configured: env.isMongoConfigured || mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    error: mongoose.connection.readyState === 1 ? null : lastError,
  };
}
