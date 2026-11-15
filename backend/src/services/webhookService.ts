import { env } from '../config/env';
import { PullRequest, Repository, Review, WebhookDelivery } from '../models';
import { enqueueReviewJob } from '../queues/reviewQueue';
import { decryptSecret, verifyGitHubWebhookSignature } from '../utils/crypto';
import { AuthenticationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { recordActivity } from './notificationService';

interface GitHubPRWebhookPayload {
  action?: string;
  repository?: {
    id: number;
    name: string;
    full_name: string;
    owner?: { login: string };
  };
  pull_request?: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    merged?: boolean;
    html_url: string;
    user?: { login: string; avatar_url: string };
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    changed_files?: number;
    additions?: number;
    deletions?: number;
  };
}

const REVIEW_TRIGGER_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

export async function processGitHubWebhook(params: {
  rawBody: Buffer;
  signature: string | undefined;
  event: string | undefined;
  deliveryId: string | undefined;
  payload: GitHubPRWebhookPayload;
}): Promise<{
  accepted: boolean;
  action?: string;
  reason?: string;
  jobId?: string;
}> {
  const { rawBody, signature, event, deliveryId, payload } = params;

  if (!event) {
    return { accepted: false, reason: 'Missing X-GitHub-Event header' };
  }

  // Locate monitored repository if payload includes repository info
  const githubRepoId = payload.repository?.id;
  const repo = githubRepoId
    ? await Repository.findOne({ githubRepositoryId: githubRepoId }).select('+webhookSecretEncrypted')
    : null;

  // Step 2: Validate GitHub HMAC-SHA256 webhook signature (per-repo secret first, then global secret)
  const candidateSecrets: string[] = [];
  if (repo?.webhookSecretEncrypted) {
    try {
      candidateSecrets.push(decryptSecret(repo.webhookSecretEncrypted));
    } catch {
      // fall through to global secret
    }
  }
  if (env.GITHUB_WEBHOOK_SECRET) {
    candidateSecrets.push(env.GITHUB_WEBHOOK_SECRET);
  }

  const signatureValid =
    candidateSecrets.length > 0 &&
    candidateSecrets.some((secret) => verifyGitHubWebhookSignature(rawBody, signature, secret));

  if (!signatureValid) {
    logger.warn('Rejected GitHub webhook due to invalid HMAC signature', {
      event,
      deliveryId,
      repo: payload.repository?.full_name,
    });
    if (repo) {
      await recordActivity({
        userId: repo.userId,
        repositoryId: repo._id,
        eventType: 'webhook.rejected',
        description: `Rejected GitHub webhook with invalid signature (${event})`,
        metadata: { deliveryId },
      });
    }
    throw new AuthenticationError('Invalid GitHub webhook signature');
  }

  // Idempotent delivery tracking via unique deliveryId
  if (deliveryId) {
    try {
      await WebhookDelivery.create({
        deliveryId,
        event,
        action: payload.action || '',
        repositoryFullName: payload.repository?.full_name || '',
      });
    } catch (err) {
      const dupCode = (err as { code?: number })?.code;
      if (dupCode === 11000) {
        logger.info('Duplicate GitHub webhook delivery ignored (idempotent)', { deliveryId });
        return { accepted: true, reason: 'duplicate_delivery_ignored' };
      }
      throw err;
    }
  }

  if (event === 'ping') {
    if (repo && repo.webhookStatus !== 'active') {
      repo.webhookStatus = 'active';
      await repo.save();
    }
    return { accepted: true, action: 'ping', reason: 'pong' };
  }

  if (event !== 'pull_request') {
    return { accepted: true, action: event, reason: 'event_ignored' };
  }

  if (!repo) {
    return { accepted: true, reason: 'repository_not_connected' };
  }

  const ghPR = payload.pull_request;
  const action = payload.action || '';
  if (!ghPR) {
    return { accepted: false, reason: 'Missing pull_request payload' };
  }

  // Upsert PullRequest record cleanly (compound unique index prevents duplicates)
  const prState = ghPR.merged ? 'merged' : ghPR.state;
  const pr = await PullRequest.findOneAndUpdate(
    { repositoryId: repo._id, githubPRId: ghPR.id },
    {
      $set: {
        prNumber: ghPR.number,
        title: ghPR.title,
        description: ghPR.body || '',
        author: ghPR.user?.login || 'unknown',
        authorAvatarUrl: ghPR.user?.avatar_url || '',
        htmlUrl: ghPR.html_url,
        state: prState,
        sourceBranch: ghPR.head.ref,
        targetBranch: ghPR.base.ref,
        headSha: ghPR.head.sha,
        baseSha: ghPR.base.sha,
        ...(typeof ghPR.changed_files === 'number' ? { changedFilesCount: ghPR.changed_files } : {}),
        ...(typeof ghPR.additions === 'number' ? { additions: ghPR.additions } : {}),
        ...(typeof ghPR.deletions === 'number' ? { deletions: ghPR.deletions } : {}),
      },
      $setOnInsert: {
        repositoryId: repo._id,
        githubPRId: ghPR.id,
        reviewStatus: 'pending',
      },
    },
    { upsert: true, new: true }
  );

  await recordActivity({
    userId: repo.userId,
    repositoryId: repo._id,
    pullRequestId: pr._id,
    eventType: 'webhook.received',
    description: `GitHub webhook: pull_request.${action} on ${repo.fullName}#${pr.prNumber}`,
    metadata: { deliveryId, action, headSha: ghPR.head.sha.slice(0, 7) },
  });

  // Handle closed PR cleanly without triggering a review
  if (action === 'closed') {
    return { accepted: true, action: 'closed', reason: 'pr_state_updated' };
  }

  if (!REVIEW_TRIGGER_ACTIONS.has(action)) {
    return { accepted: true, action, reason: 'action_does_not_trigger_review' };
  }

  if (!repo.isMonitoringEnabled || !repo.reviewSettings.autoReview) {
    pr.reviewStatus = 'skipped';
    await pr.save();
    return { accepted: true, action, reason: 'monitoring_or_autoreview_disabled' };
  }

  // Prevent reviewing the exact same commit SHA repeatedly
  const existingReview = await Review.findOne({
    pullRequestId: pr._id,
    headSha: ghPR.head.sha,
  });
  if (
    existingReview &&
    existingReview.processingStatus !== 'failed'
  ) {
    logger.info('Skipping duplicate commit review for webhook', {
      repo: repo.fullName,
      prNumber: pr.prNumber,
      headSha: ghPR.head.sha.slice(0, 7),
      existingStatus: existingReview.processingStatus,
    });
    return { accepted: true, action, reason: 'commit_already_reviewed_or_in_progress' };
  }

  // Create or reset Review document & enqueue BullMQ background job
  const review = await Review.findOneAndUpdate(
    { pullRequestId: pr._id, headSha: ghPR.head.sha },
    {
      $set: {
        repositoryId: repo._id,
        triggerSource: 'webhook',
        reviewMode: repo.reviewSettings.requireManualApproval
          ? 'manual'
          : repo.reviewSettings.reviewMode,
        processingStatus: 'queued',
        errorMessage: null,
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
    userId: String(repo.userId),
    headSha: ghPR.head.sha,
    triggerSource: 'webhook',
  });

  return {
    accepted: true,
    action,
    jobId,
  };
}
