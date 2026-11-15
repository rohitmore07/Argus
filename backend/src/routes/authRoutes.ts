import { Router } from 'express';
import {
  disconnectGitHub,
  getMe,
  githubOAuthCallback,
  logout,
  startGitHubOAuth,
} from '../controllers/authController';
import { requireAuth, requireDatabase } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/github', authRateLimiter, startGitHubOAuth);
router.get('/github/callback', authRateLimiter, requireDatabase, githubOAuthCallback);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);
router.post('/disconnect', requireAuth, disconnectGitHub);

export default router;
