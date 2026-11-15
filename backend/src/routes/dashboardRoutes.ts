import { Router } from 'express';
import {
  dashboardActivity,
  dashboardAnalytics,
  dashboardStats,
} from '../controllers/dashboardController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/stats', dashboardStats);
router.get('/analytics', dashboardAnalytics);
router.get('/activity', dashboardActivity);

export default router;
