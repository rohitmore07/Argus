import { Router } from 'express';
import { handleGitHubWebhook } from '../controllers/webhookController';
import { requireDatabase } from '../middleware/auth';
import { webhookRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/github', webhookRateLimiter, requireDatabase, handleGitHubWebhook);

export default router;
