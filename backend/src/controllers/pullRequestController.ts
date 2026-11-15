import { NextFunction, Request, Response } from 'express';
import {
  getPullRequestDetail,
  listPullRequests,
  triggerManualPullRequestReview,
} from '../services/pullRequestService';
import { Severity } from '../types';

export async function getPullRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>;
    const result = await listPullRequests(String(req.user!._id), {
      repositoryId: q.repositoryId,
      reviewStatus: q.reviewStatus,
      severity: q.severity as Severity | undefined,
      author: q.author,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      search: q.search,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPullRequestById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const detail = await getPullRequestDetail(String(req.user!._id), String(req.params.id));
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

export async function triggerReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await triggerManualPullRequestReview(
      String(req.user!._id),
      String(req.params.id)
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}
