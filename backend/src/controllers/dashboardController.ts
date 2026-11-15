import { NextFunction, Request, Response } from 'express';
import {
  getDashboardActivity,
  getDashboardAnalytics,
  getDashboardStats,
} from '../services/dashboardService';

export async function dashboardStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats(String(req.user!._id));
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function dashboardAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const analytics = await getDashboardAnalytics(String(req.user!._id), days);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
}

export async function dashboardActivity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const activity = await getDashboardActivity(String(req.user!._id), { page, limit });
    res.json(activity);
  } catch (err) {
    next(err);
  }
}
