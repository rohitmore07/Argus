import { Router } from 'express';
import {
  getPullRequestById,
  getPullRequests,
  triggerReview,
} from '../controllers/pullRequestController';
import { requireAuth } from '../middleware/auth';
import { reviewTriggerRateLimiter } from '../middleware/rateLimiter';
import { validateQuery } from '../middleware/validate';
import { listPullRequestsQuerySchema } from '../validators/pullRequestValidators';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(listPullRequestsQuerySchema), getPullRequests);
router.get('/:id', getPullRequestById);
router.post('/:id/review', reviewTriggerRateLimiter, triggerReview);

export default router;
