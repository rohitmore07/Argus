import { Router } from 'express';
import {
  getFindingsForReview,
  getReviewById,
  getReviews,
  publishReview,
} from '../controllers/reviewController';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  listFindingsQuerySchema,
  listReviewsQuerySchema,
  publishReviewBodySchema,
} from '../validators/reviewValidators';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(listReviewsQuerySchema), getReviews);
router.get('/:id', getReviewById);
router.get('/:id/findings', validateQuery(listFindingsQuerySchema), getFindingsForReview);
router.post('/:id/publish', validateBody(publishReviewBodySchema), publishReview);

export default router;
