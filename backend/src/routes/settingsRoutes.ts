import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { updateUserSettingsSchema } from '../validators/settingsValidators';

const router = Router();

router.use(requireAuth);

router.get('/', getSettings);
router.patch('/', validateBody(updateUserSettingsSchema), updateSettings);

export default router;
