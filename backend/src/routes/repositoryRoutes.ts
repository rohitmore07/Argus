import { Router } from 'express';
import {
  connectRepo,
  deleteRepository,
  getRepository,
  listGitHubRepositories,
  listRepositories,
  patchRepositorySettings,
  syncRepoPullRequests,
} from '../controllers/repositoryController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  connectRepositorySchema,
  updateRepositorySettingsSchema,
} from '../validators/repositoryValidators';

const router = Router();

router.use(requireAuth);

router.get('/', listRepositories);
router.get('/github', listGitHubRepositories);
router.post('/connect', validateBody(connectRepositorySchema), connectRepo);
router.get('/:id', getRepository);
router.patch('/:id/settings', validateBody(updateRepositorySettingsSchema), patchRepositorySettings);
router.post('/:id/sync', syncRepoPullRequests);
router.delete('/:id', deleteRepository);

export default router;
