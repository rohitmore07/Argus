import { Types } from 'mongoose';
import { env } from '../config/env';
import { Finding, PullRequest, Repository, Review, User } from '../models';
import { GitHubClient, GitHubRepoItem } from '../integrations/github/githubClient';
import { DEFAULT_REVIEW_SETTINGS, ReviewSettings } from '../types';
import { encryptSecret, generateSecureRandomHex } from '../utils/crypto';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getUserDecryptedGitHubToken } from './authService';
import { recordActivity } from './notificationService';

export async function fetchAccessibleGitHubRepositories(
  userId: string,
  page = 1,
  perPage = 50
): Promise<Array<GitHubRepoItem & { connected: boolean; connectedRepoId: string | null }>> {
  const token = await getUserDecryptedGitHubToken(userId);
  const gh = new GitHubClient(token);

  const [githubRepos, connectedRepos] = await Promise.all([
    gh.listRepositories(page, perPage),
    Repository.find({ userId }).select('_id githubRepositoryId').lean(),
  ]);

  const connectedMap = new Map<number, string>();
  for (const r of connectedRepos) {
    connectedMap.set(r.githubRepositoryId, String(r._id));
  }

  return githubRepos.map((repo) => ({
    ...repo,
    connected: connectedMap.has(repo.id),
    connectedRepoId: connectedMap.get(repo.id) || null,
  }));
}

export async function listConnectedRepositories(userId: string) {
  const repos = await Repository.find({ userId }).sort({ updatedAt: -1 }).lean();
  if (repos.length === 0) return [];

  const repoIds = repos.map((r) => r._id);

  // Real MongoDB aggregation for PRs reviewed & total findings per repository
  const [reviewAgg, findingAgg] = await Promise.all([
    Review.aggregate([
      { $match: { repositoryId: { $in: repoIds } } },
      {
        $group: {
          _id: '$repositoryId',
          totalPRsReviewed: { $sum: 1 },
          lastReviewDate: { $max: '$completedAt' },
        },
      },
    ]),
    Finding.aggregate([
      { $match: { repositoryId: { $in: repoIds }, status: { $ne: 'dismissed' } } },
      {
        $group: {
          _id: '$repositoryId',
          totalIssues: { $sum: 1 },
          criticalIssues: {
            $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] },
          },
          highIssues: {
            $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const reviewStatsMap = new Map(reviewAgg.map((r) => [String(r._id), r]));
  const findingStatsMap = new Map(findingAgg.map((f) => [String(f._id), f]));

  return repos.map((repo) => {
    const rStat = reviewStatsMap.get(String(repo._id));
    const fStat = findingStatsMap.get(String(repo._id));
    return {
      ...repo,
      stats: {
        totalPRsReviewed: rStat?.totalPRsReviewed || 0,
        totalIssuesDetected: fStat?.totalIssues || 0,
        criticalIssues: fStat?.criticalIssues || 0,
        highIssues: fStat?.highIssues || 0,
        lastReviewDate: rStat?.lastReviewDate || repo.lastReviewedAt || null,
      },
    };
  });
}

export async function getRepositoryDetail(userId: string, repositoryId: string) {
  if (!Types.ObjectId.isValid(repositoryId)) {
    throw new NotFoundError('Repository not found');
  }
  const repo = await Repository.findOne({ _id: repositoryId, userId }).lean();
  if (!repo) {
    throw new NotFoundError('Repository not found');
  }

  const [pullRequests, severityBreakdown, categoryBreakdown, totalReviews] = await Promise.all([
    PullRequest.find({ repositoryId: repo._id })
      .sort({ updatedAt: -1 })
      .limit(30)
      .populate('latestReviewId')
      .lean(),
    Finding.aggregate([
      { $match: { repositoryId: repo._id, status: { $ne: 'dismissed' } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Finding.aggregate([
      { $match: { repositoryId: repo._id, status: { $ne: 'dismissed' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Review.countDocuments({ repositoryId: repo._id }),
  ]);

  const totalIssues = severityBreakdown.reduce((acc, s) => acc + s.count, 0);

  return {
    repository: repo,
    pullRequests,
    stats: {
      totalPRsReviewed: totalReviews,
      totalIssuesDetected: totalIssues,
      severityBreakdown: Object.fromEntries(severityBreakdown.map((s) => [s._id, s.count])),
      categoryBreakdown: Object.fromEntries(categoryBreakdown.map((c) => [c._id, c.count])),
    },
  };
}

export async function connectRepository(
  userId: string,
  input: {
    owner: string;
    name: string;
    isMonitoringEnabled?: boolean;
    reviewSettings?: Partial<ReviewSettings>;
    setupWebhook?: boolean;
  }
) {
  const token = await getUserDecryptedGitHubToken(userId);
  const gh = new GitHubClient(token);

  // Verify live access to repository via GitHub REST API
  const ghRepo = await gh.getRepository(input.owner, input.name);

  const existing = await Repository.findOne({
    userId,
    githubRepositoryId: ghRepo.id,
  });
  if (existing) {
    throw new ConflictError(`Repository ${ghRepo.full_name} is already connected.`);
  }

  const user = await User.findById(userId).lean();
  const baseSettings = user?.defaultReviewSettings || DEFAULT_REVIEW_SETTINGS;
  const mergedSettings: ReviewSettings = {
    ...DEFAULT_REVIEW_SETTINGS,
    ...baseSettings,
    ...(input.reviewSettings || {}),
  };

  // Generate per-repo webhook secret and attempt real GitHub webhook registration if public URL is configured
  const rawWebhookSecret = env.GITHUB_WEBHOOK_SECRET || generateSecureRandomHex(32);
  let webhookId: number | null = null;
  let webhookStatus: 'active' | 'pending' | 'manual' | 'error' = 'manual';

  if (input.setupWebhook !== false && env.GITHUB_WEBHOOK_PUBLIC_URL) {
    try {
      const hook = await gh.createRepositoryWebhook(
        ghRepo.owner.login,
        ghRepo.name,
        env.GITHUB_WEBHOOK_PUBLIC_URL,
        rawWebhookSecret
      );
      webhookId = hook.id;
      webhookStatus = 'active';
    } catch (err) {
      webhookStatus = 'error';
      logger.warn('Automatic GitHub webhook registration failed (manual setup still supported)', {
        repo: ghRepo.full_name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const created = await Repository.create({
    userId,
    githubRepositoryId: ghRepo.id,
    name: ghRepo.name,
    fullName: ghRepo.full_name,
    owner: ghRepo.owner.login,
    description: ghRepo.description || '',
    primaryLanguage: ghRepo.language || 'Unknown',
    defaultBranch: ghRepo.default_branch || 'main',
    htmlUrl: ghRepo.html_url || `https://github.com/${ghRepo.full_name}`,
    isPrivate: Boolean(ghRepo.private),
    isMonitoringEnabled: input.isMonitoringEnabled ?? true,
    webhookId,
    webhookSecretEncrypted: encryptSecret(rawWebhookSecret),
    webhookStatus,
    reviewSettings: mergedSettings,
  });

  await recordActivity({
    userId,
    repositoryId: created._id,
    eventType: 'repository.connected',
    description: `Connected repository ${created.fullName} (webhook: ${webhookStatus})`,
    metadata: { fullName: created.fullName, webhookStatus },
  });

  // Immediately sync open PRs from GitHub so user sees real PRs right away
  try {
    await syncRepositoryPullRequests(userId, String(created._id));
  } catch (err) {
    logger.warn('Initial PR sync after repository connection failed', {
      repo: created.fullName,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return created.toObject();
}

export async function updateRepositorySettings(
  userId: string,
  repositoryId: string,
  updates: {
    isMonitoringEnabled?: boolean;
    reviewSettings?: Partial<ReviewSettings>;
  }
) {
  if (!Types.ObjectId.isValid(repositoryId)) {
    throw new NotFoundError('Repository not found');
  }
  const repo = await Repository.findOne({ _id: repositoryId, userId });
  if (!repo) {
    throw new NotFoundError('Repository not found');
  }

  if (typeof updates.isMonitoringEnabled === 'boolean') {
    repo.isMonitoringEnabled = updates.isMonitoringEnabled;
  }

  if (updates.reviewSettings) {
    const nextSettings: ReviewSettings = {
      ...repo.reviewSettings,
      ...updates.reviewSettings,
    };

    // Keep enabledCategories synchronized with per-agent boolean toggles
    const categories = new Set(nextSettings.enabledCategories);
    if (nextSettings.enableBugDetection) categories.add('bug');
    else categories.delete('bug');
    if (nextSettings.enableSecurityAnalysis) categories.add('security');
    else categories.delete('security');
    if (nextSettings.enablePerformanceAnalysis) categories.add('performance');
    else categories.delete('performance');
    if (nextSettings.enableCodeQualityAnalysis) categories.add('code_quality');
    else categories.delete('code_quality');

    nextSettings.enabledCategories = Array.from(categories);
    repo.reviewSettings = nextSettings;
  }

  await repo.save();

  await recordActivity({
    userId,
    repositoryId: repo._id,
    eventType: 'repository.settings_updated',
    description: `Updated review settings for ${repo.fullName}`,
    metadata: {
      isMonitoringEnabled: repo.isMonitoringEnabled,
      reviewMode: repo.reviewSettings.reviewMode,
      minSeverity: repo.reviewSettings.minSeverity,
    },
  });

  return repo.toObject();
}

export async function syncRepositoryPullRequests(userId: string, repositoryId: string) {
  if (!Types.ObjectId.isValid(repositoryId)) {
    throw new NotFoundError('Repository not found');
  }
  const repo = await Repository.findOne({ _id: repositoryId, userId });
  if (!repo) {
    throw new NotFoundError('Repository not found');
  }

  const token = await getUserDecryptedGitHubToken(userId);
  const gh = new GitHubClient(token);
  const ghPRs = await gh.listPullRequests(repo.owner, repo.name, 'open', 30);

  let syncedCount = 0;
  for (const pr of ghPRs) {
    await PullRequest.findOneAndUpdate(
      { repositoryId: repo._id, githubPRId: pr.id },
      {
        $set: {
          prNumber: pr.number,
          title: pr.title,
          description: pr.body || '',
          author: pr.user?.login || 'unknown',
          authorAvatarUrl: pr.user?.avatar_url || '',
          htmlUrl: pr.html_url,
          state: pr.merged_at ? 'merged' : pr.state,
          sourceBranch: pr.head.ref,
          targetBranch: pr.base.ref,
          headSha: pr.head.sha,
          baseSha: pr.base.sha,
        },
        $setOnInsert: {
          repositoryId: repo._id,
          githubPRId: pr.id,
          reviewStatus: 'pending',
        },
      },
      { upsert: true }
    );
    syncedCount += 1;
  }

  await recordActivity({
    userId,
    repositoryId: repo._id,
    eventType: 'pr.synced',
    description: `Synced ${syncedCount} open pull request(s) from ${repo.fullName}`,
    metadata: { syncedCount },
  });

  return { syncedCount };
}

export async function disconnectRepository(userId: string, repositoryId: string): Promise<void> {
  if (!Types.ObjectId.isValid(repositoryId)) {
    throw new NotFoundError('Repository not found');
  }
  const repo = await Repository.findOne({ _id: repositoryId, userId });
  if (!repo) {
    throw new NotFoundError('Repository not found');
  }

  // Attempt to remove GitHub webhook cleanly
  if (repo.webhookId) {
    try {
      const token = await getUserDecryptedGitHubToken(userId);
      const gh = new GitHubClient(token);
      await gh.deleteRepositoryWebhook(repo.owner, repo.name, repo.webhookId);
    } catch (err) {
      logger.warn('Could not delete GitHub webhook while disconnecting repository', {
        repo: repo.fullName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const fullName = repo.fullName;
  await Promise.all([
    Finding.deleteMany({ repositoryId: repo._id }),
    Review.deleteMany({ repositoryId: repo._id }),
    PullRequest.deleteMany({ repositoryId: repo._id }),
    Repository.deleteOne({ _id: repo._id }),
  ]);

  await recordActivity({
    userId,
    eventType: 'repository.disconnected',
    description: `Disconnected repository ${fullName}`,
    metadata: { fullName },
  });
}
