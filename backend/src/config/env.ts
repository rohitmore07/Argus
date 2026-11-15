import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  BACKEND_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().optional().default(''),
  REDIS_URL: z.string().optional().default(''),

  JWT_SECRET: z.string().optional().default(''),
  TOKEN_ENCRYPTION_KEY: z.string().optional().default(''),

  GITHUB_CLIENT_ID: z.string().optional().default(''),
  GITHUB_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_CALLBACK_URL: z.string().optional().default(''),

  GITHUB_WEBHOOK_SECRET: z.string().optional().default(''),
  GITHUB_WEBHOOK_PUBLIC_URL: z.string().optional().default(''),

  GITHUB_APP_ID: z.string().optional().default(''),
  GITHUB_APP_PRIVATE_KEY: z.string().optional().default(''),
  GITHUB_APP_CLIENT_ID: z.string().optional().default(''),
  GITHUB_APP_CLIENT_SECRET: z.string().optional().default(''),

  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),

  REVIEW_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  MAX_FILES_PER_BATCH: z.coerce.number().int().min(1).max(30).default(8),
  LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

// Ephemeral fallback secrets ONLY for non-production local startup before .env is configured.
// In production, refuse weak/missing cryptographic keys.
const ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');
const ephemeralEncKey = crypto.randomBytes(32).toString('hex');

if (raw.NODE_ENV === 'production') {
  if (!raw.JWT_SECRET || raw.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be set and at least 32 characters in production.');
    process.exit(1);
  }
  if (!raw.TOKEN_ENCRYPTION_KEY || raw.TOKEN_ENCRYPTION_KEY.length < 32) {
    console.error('FATAL: TOKEN_ENCRYPTION_KEY must be set and at least 32 characters in production.');
    process.exit(1);
  }
}

export const env = {
  ...raw,
  JWT_SECRET: raw.JWT_SECRET && raw.JWT_SECRET.length >= 16 ? raw.JWT_SECRET : ephemeralJwtSecret,
  TOKEN_ENCRYPTION_KEY:
    raw.TOKEN_ENCRYPTION_KEY && raw.TOKEN_ENCRYPTION_KEY.length >= 32
      ? raw.TOKEN_ENCRYPTION_KEY
      : ephemeralEncKey,
  GITHUB_CALLBACK_URL:
    raw.GITHUB_CALLBACK_URL || `${raw.FRONTEND_URL.replace(/\/$/, '')}/api/auth/github/callback`,
  isMongoConfigured: Boolean(raw.MONGODB_URI && !raw.MONGODB_URI.includes('cluster0.example.mongodb.net')),
  isRedisConfigured: Boolean(raw.REDIS_URL),
  isGitHubOAuthConfigured: Boolean(raw.GITHUB_CLIENT_ID && raw.GITHUB_CLIENT_SECRET),
  isGitHubAppConfigured: Boolean(raw.GITHUB_APP_ID && raw.GITHUB_APP_PRIVATE_KEY),
  isGeminiConfigured: Boolean(raw.GEMINI_API_KEY),
  hasPersistentSecrets: Boolean(
    raw.JWT_SECRET &&
      raw.JWT_SECRET.length >= 32 &&
      raw.TOKEN_ENCRYPTION_KEY &&
      raw.TOKEN_ENCRYPTION_KEY.length >= 32
  ),
};

export type AppEnv = typeof env;
