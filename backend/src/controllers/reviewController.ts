import { NextFunction, Request, Response } from 'express';
import {
  dismissFinding,
  getReviewDetail,
  getReviewFindings,
  listReviews,
  publishReviewManually,
  publishSingleFindingToGitHub,
} from '../services/reviewService';
import { FindingCategory, FindingStatus, Severity } from '../types';

export async function getReviews(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>;
    const result = await listReviews(String(req.user!._id), {
      repositoryId: q.repositoryId,
      status: q.status,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getReviewById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const detail = await getReviewDetail(String(req.user!._id), String(req.params.id));
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

export async function getFindingsForReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>;
    const findings = await getReviewFindings(String(req.user!._id), String(req.params.id), {
      severity: q.severity as Severity | undefined,
      category: q.category as FindingCategory | undefined,
      status: q.status as FindingStatus | undefined,
      filePath: q.filePath,
    });
    res.json({ findings });
  } catch (err) {
    next(err);
  }
}

export async function publishReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await publishReviewManually(
      String(req.user!._id),
      String(req.params.id),
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function publishSingleFinding(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await publishSingleFindingToGitHub(
      String(req.user!._id),
      String(req.params.id)
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function dismissSingleFinding(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const finding = await dismissFinding(
      String(req.user!._id),
      String(req.params.id),
      req.body?.reason || ''
    );
    res.json({ finding });
  } catch (err) {
    next(err);
  }
}
