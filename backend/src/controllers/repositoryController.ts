import { NextFunction, Request, Response } from 'express';
import {
  connectRepository,
  disconnectRepository,
  fetchAccessibleGitHubRepositories,
  getRepositoryDetail,
  listConnectedRepositories,
  syncRepositoryPullRequests,
  updateRepositorySettings,
} from '../services/repositoryService';

export async function listRepositories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const repositories = await listConnectedRepositories(String(req.user!._id));
    res.json({ repositories });
  } catch (err) {
    next(err);
  }
}

export async function listGitHubRepositories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 50));
    const repositories = await fetchAccessibleGitHubRepositories(
      String(req.user!._id),
      page,
      perPage
    );
    res.json({ repositories, page, perPage });
  } catch (err) {
    next(err);
  }
}

export async function getRepository(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const detail = await getRepositoryDetail(String(req.user!._id), String(req.params.id));
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

export async function connectRepo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const repository = await connectRepository(String(req.user!._id), req.body);
    res.status(201).json({ repository });
  } catch (err) {
    next(err);
  }
}

export async function patchRepositorySettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const repository = await updateRepositorySettings(
      String(req.user!._id),
      String(req.params.id),
      req.body
    );
    res.json({ repository });
  } catch (err) {
    next(err);
  }
}

export async function syncRepoPullRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await syncRepositoryPullRequests(
      String(req.user!._id),
      String(req.params.id)
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function deleteRepository(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await disconnectRepository(String(req.user!._id), String(req.params.id));
    res.json({ success: true, message: 'Repository disconnected' });
  } catch (err) {
    next(err);
  }
}
