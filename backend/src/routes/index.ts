import { Router, Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database';
import { getRedisStatus } from '../config/redis';
import { env } from '../config/env';
import { getQueueMetrics } from '../queues/reviewQueue';
import { llmRegistry } from '../integrations/llm/llmProvider';
import '../integrations/llm/geminiProvider';
import authRoutes from './authRoutes';
import repositoryRoutes from './repositoryRoutes';
import pullRequestRoutes from './pullRequestRoutes';
import reviewRoutes from './reviewRoutes';
import findingRoutes from './findingRoutes';
import dashboardRoutes from './dashboardRoutes';
import webhookRoutes from './webhookRoutes';
import settingsRoutes from './settingsRoutes';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const db = getDatabaseStatus();
  const redis = getRedisStatus();
  const queue = await getQueueMetrics();

  const ready =
    db.connected &&
    redis.connected &&
    env.isGitHubOAuthConfigured &&
    env.isGeminiConfigured;

  res.status(200).json({
    status: ready ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: {
        connected: db.connected,
        configured: db.configured,
        error: db.error,
      },
      redis: {
        connected: redis.connected,
        configured: redis.configured,
        error: redis.error,
      },
      bullmq: queue,
      githubOAuth: {
        configured: env.isGitHubOAuthConfigured,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      githubApp: {
        configured: env.isGitHubAppConfigured,
      },
      githubWebhook: {
        secretConfigured: Boolean(env.GITHUB_WEBHOOK_SECRET),
        publicUrlConfigured: Boolean(env.GITHUB_WEBHOOK_PUBLIC_URL),
        endpoint:
          env.GITHUB_WEBHOOK_PUBLIC_URL || `${env.BACKEND_URL.replace(/\/$/, '')}/api/webhooks/github`,
      },
      ai: {
        provider: env.LLM_PROVIDER,
        model: env.GEMINI_MODEL,
        configured: env.isGeminiConfigured,
        providers: llmRegistry.list(),
      },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/repositories', repositoryRoutes);
router.use('/pull-requests', pullRequestRoutes);
router.use('/reviews', reviewRoutes);
router.use('/findings', findingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/settings', settingsRoutes);

export default router;
