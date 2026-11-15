import { FilterQuery, Types } from 'mongoose';
import { Finding, PullRequest, Repository, Review, IPullRequest } from '../models';
import { Severity } from '../types';
import { NotFoundError } from '../utils/errors';
import { enqueueReviewJob } from '../queues/reviewQueue';
import { recordActivity } from './notificationService';

export interface ListPullRequestsFilters {
  repositoryId?: string;
  reviewStatus?: string;
  severity?: Severity;
  author?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listPullRequests(userId: string, filters: ListPullRequestsFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  // Scope strictly to user's connected repositories
  const userRepos = await Repository.find({ userId }).select('_id name fullName owner').lean();
  const userRepoIds = userRepos.map((r) => r._id);

  if (userRepoIds.length === 0) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const query: FilterQuery<IPullRequest> = {
    repositoryId: { $in: userRepoIds },
  };

  if (filters.repositoryId && Types.ObjectId.isValid(filters.repositoryId)) {
    const requestedId = new Types.ObjectId(filters.repositoryId);
    const owned = userRepoIds.some((id) => id.equals(requestedId));
    if (!owned) {
      return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    query.repositoryId = requestedId;
  }

  if (filters.reviewStatus) {
    query.reviewStatus = filters.reviewStatus as IPullRequest['reviewStatus'];
  }

  if (filters.author) {
    query.author = { $regex: filters.author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const numeric = /^\d+$/.test(filters.search.trim()) ? parseInt(filters.search.trim(), 10) : null;
    query.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { sourceBranch: { $regex: escaped, $options: 'i' } },
      { author: { $regex: escaped, $options: 'i' } },
      ...(numeric !== null ? [{ prNumber: numeric }] : []),
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) dateFilter.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.$lte = new Date(filters.dateTo);
    query.updatedAt = dateFilter;
  }

  // If filtering by severity, find pullRequestIds that have findings at that severity
  if (filters.severity) {
    const matchingPRIds = await Finding.distinct('pullRequestId', {
      repositoryId: { $in: userRepoIds },
      severity: filters.severity,
      status: { $ne: 'dismissed' },
    });
    query._id = { $in: matchingPRIds };
  }

  const [total, prs] = await Promise.all([
    PullRequest.countDocuments(query),
    PullRequest.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('repositoryId', 'name fullName owner primaryLanguage htmlUrl')
      .populate(
        'latestReviewId',
        'overallStatus processingStatus totalFindings criticalCount highCount mediumCount lowCount infoCount completedAt startedAt'
      )
      .lean(),
  ]);

  return {
    items: prs.map((pr) => ({
      ...pr,
      changedFilesCount: pr.changedFilesCount || pr.changedFiles?.length || 0,
      // Omit full patches in list response for bandwidth efficiency
      changedFiles: undefined,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPullRequestDetail(userId: string, pullRequestId: string) {
  if (!Types.ObjectId.isValid(pullRequestId)) {
    throw new NotFoundError('Pull Request not found');
  }

  const pr = await PullRequest.findById(pullRequestId)
    .populate('repositoryId')
    .lean();
  if (!pr) {
    throw new NotFoundError('Pull Request not found');
  }

  const repo = pr.repositoryId as unknown as { _id: Types.ObjectId; userId: Types.ObjectId };
  if (!repo || String(repo.userId) !== String(userId)) {
    throw new NotFoundError('Pull Request not found');
  }

  const reviews = await Review.find({ pullRequestId: pr._id })
    .sort({ createdAt: -1 })
    .lean();

  return {
    pullRequest: pr,
    reviews,
  };
}

export async function triggerManualPullRequestReview(userId: string, pullRequestId: string) {
  if (!Types.ObjectId.isValid(pullRequestId)) {
    throw new NotFoundError('Pull Request not found');
  }

  const pr = await PullRequest.findById(pullRequestId);
  if (!pr) {
    throw new NotFoundError('Pull Request not found');
  }

  const repo = await Repository.findOne({ _id: pr.repositoryId, userId });
  if (!repo) {
    throw new NotFoundError('Repository not found or access denied');
  }

  // Upsert Review record keyed by (pullRequestId, headSha) to honor compound unique index
  const review = await Review.findOneAndUpdate(
    { pullRequestId: pr._id, headSha: pr.headSha },
    {
      $set: {
        repositoryId: repo._id,
        triggerSource: 'manual',
        reviewMode: repo.reviewSettings.requireManualApproval
          ? 'manual'
          : repo.reviewSettings.reviewMode,
        processingStatus: 'queued',
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    },
    { upsert: true, new: true }
  );

  pr.reviewStatus = 'queued';
  pr.latestReviewId = review._id;
  await pr.save();

  const { jobId } = await enqueueReviewJob({
    pullRequestId: String(pr._id),
    repositoryId: String(repo._id),
    reviewId: String(review._id),
    userId: String(userId),
    headSha: pr.headSha,
    triggerSource: 'manual',
    forceReReview: true,
  });

  await recordActivity({
    userId,
    repositoryId: repo._id,
    pullRequestId: pr._id,
    eventType: 'review.queued',
    description: `Manual review queued for ${repo.fullName}#${pr.prNumber} (${pr.headSha.slice(0, 7)})`,
    metadata: { jobId, reviewId: String(review._id), headSha: pr.headSha },
  });

  return {
    jobId,
    reviewId: String(review._id),
    status: 'queued',
  };
}
