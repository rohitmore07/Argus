import { Router } from 'express';
import {
  dismissSingleFinding,
  publishSingleFinding,
} from '../controllers/reviewController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { dismissFindingBodySchema } from '../validators/reviewValidators';

const router = Router();

router.use(requireAuth);

router.post('/:id/publish', publishSingleFinding);
router.post('/:id/dismiss', validateBody(dismissFindingBodySchema), dismissSingleFinding);

export default router;
