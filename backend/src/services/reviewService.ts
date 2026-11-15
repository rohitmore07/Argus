import { FilterQuery, Types } from 'mongoose';
import {
  Finding,
  IFinding,
  PullRequest,
  Repository,
  Review,
  ReviewComment,
  User,
} from '../models';
import { GitHubClient, GitHubReviewCommentPayload } from '../integrations/github/githubClient';
import { llmRegistry } from '../integrations/llm/llmProvider';
import '../integrations/llm/geminiProvider'; // Ensure Gemini provider is registered
import {
  formatInlineCommentMarkdown,
  reviewOrchestrator,
} from '../agents/review-orchestrator/reviewOrchestrator';
import {
  FindingCategory,
  FindingStatus,
  ReviewJobPayload,
  ReviewMode,
  Severity,
} from '../types';
import {
  extractSurroundingContext,
  matchesIgnorePattern,
  parseFilePatch,
} from '../utils/diffParser';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getUserDecryptedGitHubToken } from './authService';
import { notifyReviewEvent, recordActivity } from './notificationService';

const MAX_INLINE_COMMENTS_PER_REVIEW = 25;

/**
 * Extracts PR Sentinel fingerprints already present in existing GitHub PR comments
 * so we NEVER flood a PR with duplicate inline comments across review cycles.
 */
function extractExistingFingerprints(comments: Array<{ body: string }>): Set<string> {
  const fps = new Set<string>();
  const regex = /<!--\s*pr-sentinel:fingerprint=([a-f0-9]+)\s*-->/i;
  for (const c of comments) {
    const match = c.body.match(regex);
    if (match?.[1]) {
      fps.add(match[1]);
    }
  }
  return fps;
}

/**
 * Executes the complete automated 12-step PR review workflow inside a BullMQ worker job.
 */
export async function executeReviewJob(payload: ReviewJobPayload): Promise<void> {
  const { pullRequestId, repositoryId, reviewId, userId, headSha, triggerSource } = payload;

  const [repo, pr, review, user] = await Promise.all([
    Repository.findById(repositoryId),
    PullRequest.findById(pullRequestId),
    Review.findById(reviewId),
    User.findById(userId),
  ]);

  if (!repo || !pr || !review || !user) {
    logger.warn('Review job aborted because referenced database records no longer exist', {
      pullRequestId,
      repositoryId,
      reviewId,
    });
    return;
  }

  try {
    // Mark review started
    review.processingStatus = 'fetching_context';
    review.startedAt = new Date();
    review.errorMessage = null;
    await review.save();

    pr.reviewStatus = 'in_progress';
    pr.latestReviewId = review._id;
    await pr.save();

    await recordActivity({
      userId: user._id,
      repositoryId: repo._id,
      pullRequestId: pr._id,
      eventType: 'review.started',
      description: `Started AI multi-agent review for ${repo.fullName}#${pr.prNumber} (${headSha.slice(0, 7)})`,
      metadata: { reviewId: String(review._id), triggerSource },
    });

    // STEP 3: Fetch fresh PR metadata, commits, changed files, patches & surrounding code context from GitHub API
    const accessToken = await getUserDecryptedGitHubToken(String(user._id));
    const gh = new GitHubClient(accessToken);

    const [ghPR, ghCommits, ghFiles] = await Promise.all([
      gh.getPullRequest(repo.owner, repo.name, pr.prNumber),
      gh.getPullRequestCommits(repo.owner, repo.name, pr.prNumber),
      gh.getPullRequestFiles(repo.owner, repo.name, pr.prNumber),
    ]);

    // Sync latest PR fields & changed files in MongoDB
    pr.title = ghPR.title;
    pr.description = ghPR.body || '';
    pr.headSha = ghPR.head.sha;
    pr.baseSha = ghPR.base.sha;
    pr.sourceBranch = ghPR.head.ref;
    pr.targetBranch = ghPR.base.ref;
    pr.changedFiles = ghFiles;
    pr.changedFilesCount = ghFiles.length;
    pr.additions = ghPR.additions ?? ghFiles.reduce((acc, f) => acc + f.additions, 0);
    pr.deletions = ghPR.deletions ?? ghFiles.reduce((acc, f) => acc + f.deletions, 0);
    await pr.save();

    // Parse diffs & fetch bounded surrounding file context for top non-ignored files
    const parsedFiles = ghFiles.map((f) => parseFilePatch(f));
    const eligibleForContext = parsedFiles
      .filter(
        (f) =>
          f.status !== 'removed' &&
          f.changedLines.size > 0 &&
          !matchesIgnorePattern(f.filename, repo.reviewSettings.ignoredPaths || [])
      )
      .slice(0, 20);

    await Promise.all(
      eligibleForContext.map(async (pf) => {
        const fullContent = await gh.getFileContent(repo.owner, repo.name, pf.filename, ghPR.head.sha);
        if (fullContent) {
          pf.surroundingContext = extractSurroundingContext(fullContent, pf, 15, 160);
        }
      })
    );

    // STEP 5, 6, 7, 8: Multi-Agent Code Analysis + Static Analysis + Grounding Validation + Orchestration
    review.processingStatus = 'analyzing';
    await review.save();

    const providerName = user.aiPreferences?.provider || 'gemini';
    const provider = llmRegistry.get(providerName);

    const orchestrated = await reviewOrchestrator.runReview({
      provider,
      repoFullName: repo.fullName,
      prNumber: pr.prNumber,
      prTitle: pr.title,
      prDescription: pr.description,
      sourceBranch: pr.sourceBranch,
      targetBranch: pr.targetBranch,
      headSha: ghPR.head.sha,
      commitMessages: ghCommits.map((c) => c.commit.message.split('\n')[0]),
      parsedFiles,
      settings: repo.reviewSettings,
      model: user.aiPreferences?.model,
      temperature: user.aiPreferences?.temperature,
    });

    // STEP 10 (Part 1): Persist validated findings into MongoDB
    review.processingStatus = 'validating';
    await review.save();

    // Clear previously unpublished findings if this is a manual re-review on the same commit SHA
    await Finding.deleteMany({ reviewId: review._id, status: { $in: ['open'] } });

    const existingPublishedFindings = await Finding.find({
      reviewId: review._id,
      status: { $in: ['published', 'dismissed', 'resolved'] },
    })
      .select('fingerprint')
      .lean();
    const preservedFingerprints = new Set(existingPublishedFindings.map((f) => f.fingerprint));

    const docsToInsert = orchestrated.findings
      .filter((f) => !preservedFingerprints.has(f.fingerprint))
      .map((f) => ({
        reviewId: review._id,
        pullRequestId: pr._id,
        repositoryId: repo._id,
        agentSource: f.agentSource,
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        impact: f.impact,
        recommendation: f.recommendation,
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        codeSnippet: f.codeSnippet,
        suggestedFix: f.suggestedFix || '',
        confidenceScore: f.confidenceScore,
        status: 'open' as FindingStatus,
        fingerprint: f.fingerprint,
        cwe: f.cwe || '',
        owasp: f.owasp || '',
      }));

    if (docsToInsert.length > 0) {
      await Finding.insertMany(docsToInsert, { ordered: false }).catch((err) => {
        logger.warn('Non-fatal duplicate fingerprint skipped during Finding insertMany', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Recompute accurate counts from MongoDB findings
    const allReviewFindings = await Finding.find({ reviewId: review._id }).lean();
    const activeFindings = allReviewFindings.filter((f) => f.status !== 'dismissed');

    review.totalFindings = activeFindings.length;
    review.criticalCount = activeFindings.filter((f) => f.severity === 'CRITICAL').length;
    review.highCount = activeFindings.filter((f) => f.severity === 'HIGH').length;
    review.mediumCount = activeFindings.filter((f) => f.severity === 'MEDIUM').length;
    review.lowCount = activeFindings.filter((f) => f.severity === 'LOW').length;
    review.infoCount = activeFindings.filter((f) => f.severity === 'INFO').length;
    review.summary = orchestrated.summary;
    review.llmProvider = orchestrated.provider;
    review.llmModel = orchestrated.model;
    review.tokensUsed = orchestrated.tokensUsed;
    review.filesAnalyzed = orchestrated.filesAnalyzed;

    const effectiveMode: ReviewMode = repo.reviewSettings.requireManualApproval
      ? 'manual'
      : repo.reviewSettings.reviewMode;
    review.reviewMode = effectiveMode;

    // STEP 9: GitHub Publishing (automatic for comment_only / request_changes, held for manual mode)
    if (effectiveMode === 'manual') {
      review.processingStatus = 'awaiting_approval';
      review.overallStatus = 'pending_approval';
      review.completedAt = new Date();
      await review.save();

      pr.reviewStatus = 'awaiting_approval';
      pr.lastReviewedSha = ghPR.head.sha;
      await pr.save();

      repo.lastReviewedAt = new Date();
      await repo.save();

      await notifyReviewEvent({
        userId: user._id,
        repositoryId: repo._id,
        pullRequestId: pr._id,
        eventType: 'review.awaiting_approval',
        repoFullName: repo.fullName,
        prNumber: pr.prNumber,
        prTitle: pr.title,
        totalFindings: review.totalFindings,
        criticalCount: review.criticalCount,
        highCount: review.highCount,
      });
      return;
    }

    await publishReviewInternal({
      gh,
      userId: String(user._id),
      repo,
      pr,
      review,
      mode: effectiveMode,
    });

    await notifyReviewEvent({
      userId: user._id,
      repositoryId: repo._id,
      pullRequestId: pr._id,
      eventType: 'review.completed',
      repoFullName: repo.fullName,
      prNumber: pr.prNumber,
      prTitle: pr.title,
      totalFindings: review.totalFindings,
      criticalCount: review.criticalCount,
      highCount: review.highCount,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('PR review job failed', {
      reviewId,
      pullRequestId,
      repo: repo.fullName,
      prNumber: pr.prNumber,
      error: errorMessage,
    });

    review.processingStatus = 'failed';
    review.overallStatus = 'failed';
    review.errorMessage = errorMessage.slice(0, 1000);
    review.completedAt = new Date();
    await review.save();

    pr.reviewStatus = 'failed';
    await pr.save();

    await notifyReviewEvent({
      userId: user._id,
      repositoryId: repo._id,
      pullRequestId: pr._id,
      eventType: 'review.failed',
      repoFullName: repo.fullName,
      prNumber: pr.prNumber,
      prTitle: pr.title,
      errorMessage,
    });

    throw err;
  }
}

async function publishReviewInternal(params: {
  gh: GitHubClient;
  userId: string;
  repo: { _id: Types.ObjectId; owner: string; name: string; fullName: string; lastReviewedAt: Date | null; save: () => Promise<unknown> };
  pr: {
    _id: Types.ObjectId;
    prNumber: number;
    headSha: string;
    reviewStatus: string;
    lastReviewedSha: string | null;
    save: () => Promise<unknown>;
  };
  review: {
    _id: Types.ObjectId;
    headSha: string;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    summary: { markdown: string };
    processingStatus: string;
    overallStatus: string;
    githubReviewId: number | null;
    completedAt: Date | null;
    save: () => Promise<unknown>;
  };
  mode: ReviewMode;
  findingIds?: string[];
}): Promise<{ githubReviewId: number; publishedCount: number; skippedDuplicates: number }> {
  const { gh, repo, pr, review, mode, findingIds } = params;

  review.processingStatus = 'publishing';
  await review.save();

  const findingQuery: FilterQuery<IFinding> = {
    reviewId: review._id,
    status: { $in: ['open', 'published'] },
  };
  if (findingIds && findingIds.length > 0) {
    findingQuery._id = { $in: findingIds.filter((id) => Types.ObjectId.isValid(id)) };
  }

  const candidateFindings = await Finding.find(findingQuery).sort({ createdAt: 1 });

  // Prevent duplicate inline comments by checking both MongoDB ReviewComments and live GitHub PR comments
  const [existingDbComments, existingGhComments] = await Promise.all([
    ReviewComment.find({
      pullRequestId: pr._id,
      publishingStatus: 'published',
    })
      .select('fingerprint')
      .lean(),
    gh.listPullRequestReviewComments(repo.owner, repo.name, pr.prNumber).catch(() => []),
  ]);

  const existingFingerprints = extractExistingFingerprints(existingGhComments);
  for (const c of existingDbComments) {
    existingFingerprints.add(c.fingerprint);
  }

  const inlinePayloads: Array<{
    finding: IFinding;
    payload: GitHubReviewCommentPayload;
  }> = [];
  let skippedDuplicates = 0;

  for (const finding of candidateFindings) {
    if (existingFingerprints.has(finding.fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }
    if (inlinePayloads.length >= MAX_INLINE_COMMENTS_PER_REVIEW) break;

    const body = formatInlineCommentMarkdown({
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      description: finding.description,
      impact: finding.impact,
      recommendation: finding.recommendation,
      suggestedFix: finding.suggestedFix,
      confidenceScore: finding.confidenceScore,
      cwe: finding.cwe,
      owasp: finding.owasp,
      fingerprint: finding.fingerprint,
    });

    inlinePayloads.push({
      finding,
      payload: {
        path: finding.filePath,
        line: finding.endLine,
        start_line: finding.startLine < finding.endLine ? finding.startLine : undefined,
        side: 'RIGHT',
        body,
      },
    });
  }

  // Strictly enforce NEVER approving a PR; only REQUEST_CHANGES when configured & severe issues exist
  const hasSevereFindings = candidateFindings.some(
    (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
  );
  const githubEvent: 'COMMENT' | 'REQUEST_CHANGES' =
    mode === 'request_changes' && hasSevereFindings ? 'REQUEST_CHANGES' : 'COMMENT';

  // Publish review with inline comments; if GitHub rejects any inline line position (422), retry cleanly per comment
  let ghReviewResult: { id: number; html_url: string; state: string };
  let publishedCount = 0;

  try {
    ghReviewResult = await gh.createPullRequestReview(repo.owner, repo.name, pr.prNumber, {
      commitId: review.headSha,
      body: review.summary.markdown,
      event: githubEvent,
      comments: inlinePayloads.map((x) => x.payload),
    });

    for (const item of inlinePayloads) {
      await ReviewComment.create({
        reviewId: review._id,
        findingId: item.finding._id,
        pullRequestId: pr._id,
        githubCommentId: ghReviewResult.id,
        filePath: item.finding.filePath,
        line: item.finding.endLine,
        commentBody: item.payload.body,
        fingerprint: item.finding.fingerprint,
        publishingStatus: 'published',
      });
      item.finding.status = 'published';
      await item.finding.save();
      publishedCount += 1;
    }
  } catch (batchErr) {
    logger.warn(
      'Batch GitHub review inline submission failed; publishing summary first and individual inline comments with fallback',
      { error: batchErr instanceof Error ? batchErr.message : String(batchErr) }
    );

    ghReviewResult = await gh.createPullRequestReview(repo.owner, repo.name, pr.prNumber, {
      commitId: review.headSha,
      body: review.summary.markdown,
      event: githubEvent,
      comments: [],
    });

    for (const item of inlinePayloads) {
      try {
        const single = await gh.createSingleInlineComment(repo.owner, repo.name, pr.prNumber, {
          commitId: review.headSha,
          path: item.payload.path,
          line: item.payload.line,
          startLine: item.payload.start_line,
          body: item.payload.body,
        });
        await ReviewComment.create({
          reviewId: review._id,
          findingId: item.finding._id,
          pullRequestId: pr._id,
          githubCommentId: single.id,
          filePath: item.finding.filePath,
          line: item.finding.endLine,
          commentBody: item.payload.body,
          fingerprint: item.finding.fingerprint,
          publishingStatus: 'published',
        });
        item.finding.status = 'published';
        await item.finding.save();
        publishedCount += 1;
      } catch (singleErr) {
        await ReviewComment.create({
          reviewId: review._id,
          findingId: item.finding._id,
          pullRequestId: pr._id,
          githubCommentId: null,
          filePath: item.finding.filePath,
          line: item.finding.endLine,
          commentBody: item.payload.body,
          fingerprint: item.finding.fingerprint,
          publishingStatus: 'failed',
          errorMessage: singleErr instanceof Error ? singleErr.message : String(singleErr),
        });
      }
    }
  }

  review.githubReviewId = ghReviewResult.id;
  review.processingStatus = 'completed';
  review.overallStatus =
    githubEvent === 'REQUEST_CHANGES'
      ? 'changes_requested'
      : review.totalFindings === 0
        ? 'clean'
        : 'commented';
  review.completedAt = new Date();
  await review.save();

  pr.reviewStatus = 'completed';
  pr.lastReviewedSha = review.headSha;
  await pr.save();

  repo.lastReviewedAt = new Date();
  await repo.save();

  await recordActivity({
    userId: params.userId,
    repositoryId: repo._id,
    pullRequestId: pr._id,
    eventType: 'review.published',
    description: `Published GitHub review (${githubEvent}) to ${repo.fullName}#${pr.prNumber} with ${publishedCount} inline comment(s)`,
    metadata: {
      githubReviewId: ghReviewResult.id,
      publishedCount,
      skippedDuplicates,
      event: githubEvent,
    },
  });

  return {
    githubReviewId: ghReviewResult.id,
    publishedCount,
    skippedDuplicates,
  };
}

export async function listReviews(
  userId: string,
  filters: { repositoryId?: string; status?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const userRepos = await Repository.find({ userId }).select('_id').lean();
  const repoIds = userRepos.map((r) => r._id);
  if (repoIds.length === 0) {
    return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  const query: Record<string, unknown> = { repositoryId: { $in: repoIds } };
  if (filters.repositoryId && Types.ObjectId.isValid(filters.repositoryId)) {
    query.repositoryId = new Types.ObjectId(filters.repositoryId);
  }
  if (filters.status) {
    query.processingStatus = filters.status;
  }

  const [total, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('repositoryId', 'name fullName owner primaryLanguage')
      .populate('pullRequestId', 'prNumber title author sourceBranch targetBranch htmlUrl')
      .lean(),
  ]);

  return {
    items: reviews,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getReviewDetail(userId: string, reviewId: string) {
  if (!Types.ObjectId.isValid(reviewId)) {
    throw new NotFoundError('Review not found');
  }

  const review = await Review.findById(reviewId)
    .populate('repositoryId')
    .populate('pullRequestId')
    .lean();
  if (!review) {
    throw new NotFoundError('Review not found');
  }

  const repo = review.repositoryId as unknown as { _id: Types.ObjectId; userId: Types.ObjectId };
  if (!repo || String(repo.userId) !== String(userId)) {
    throw new NotFoundError('Review not found');
  }

  const [findings, comments] = await Promise.all([
    Finding.find({ reviewId: review._id }).sort({ createdAt: 1 }).lean(),
    ReviewComment.find({ reviewId: review._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const commentByFinding = new Map(comments.map((c) => [String(c.findingId), c]));

  return {
    review,
    findings: findings.map((f) => ({
      ...f,
      commentStatus: commentByFinding.get(String(f._id)) || null,
    })),
    comments,
  };
}

export async function getReviewFindings(
  userId: string,
  reviewId: string,
  filters: { severity?: Severity; category?: FindingCategory; status?: FindingStatus; filePath?: string }
) {
  if (!Types.ObjectId.isValid(reviewId)) {
    throw new NotFoundError('Review not found');
  }
  const review = await Review.findById(reviewId).populate('repositoryId', 'userId').lean();
  if (!review) throw new NotFoundError('Review not found');
  const repo = review.repositoryId as unknown as { userId: Types.ObjectId };
  if (!repo || String(repo.userId) !== String(userId)) {
    throw new NotFoundError('Review not found');
  }

  const query: FilterQuery<IFinding> = { reviewId: review._id };
  if (filters.severity) query.severity = filters.severity;
  if (filters.category) query.category = filters.category;
  if (filters.status) query.status = filters.status;
  if (filters.filePath) query.filePath = filters.filePath;

  const findings = await Finding.find(query).sort({ startLine: 1 }).lean();
  const comments = await ReviewComment.find({ reviewId: review._id }).lean();
  const commentMap = new Map(comments.map((c) => [String(c.findingId), c]));

  return findings.map((f) => ({
    ...f,
    commentStatus: commentMap.get(String(f._id)) || null,
  }));
}

export async function publishReviewManually(
  userId: string,
  reviewId: string,
  options?: { reviewMode?: ReviewMode; findingIds?: string[] }
) {
  if (!Types.ObjectId.isValid(reviewId)) {
    throw new NotFoundError('Review not found');
  }
  const review = await Review.findById(reviewId);
  if (!review) throw new NotFoundError('Review not found');

  const [repo, pr] = await Promise.all([
    Repository.findOne({ _id: review.repositoryId, userId }),
    PullRequest.findById(review.pullRequestId),
  ]);
  if (!repo || !pr) throw new NotFoundError('Review repository or pull request not found');

  if (
    review.processingStatus !== 'completed' &&
    review.processingStatus !== 'awaiting_approval'
  ) {
    throw new ValidationError('Review must finish analyzing before publishing to GitHub');
  }

  const accessToken = await getUserDecryptedGitHubToken(userId);
  const gh = new GitHubClient(accessToken);

  const mode =
    options?.reviewMode && options.reviewMode !== 'manual'
      ? options.reviewMode
      : repo.reviewSettings.reviewMode === 'manual'
        ? 'comment_only'
        : repo.reviewSettings.reviewMode;

  return publishReviewInternal({
    gh,
    userId,
    repo,
    pr,
    review,
    mode,
    findingIds: options?.findingIds,
  });
}

export async function publishSingleFindingToGitHub(userId: string, findingId: string) {
  if (!Types.ObjectId.isValid(findingId)) {
    throw new NotFoundError('Finding not found');
  }
  const finding = await Finding.findById(findingId);
  if (!finding) throw new NotFoundError('Finding not found');

  const [repo, pr, review] = await Promise.all([
    Repository.findOne({ _id: finding.repositoryId, userId }),
    PullRequest.findById(finding.pullRequestId),
    Review.findById(finding.reviewId),
  ]);
  if (!repo || !pr || !review) throw new NotFoundError('Finding access denied');

  const existingPublished = await ReviewComment.findOne({
    pullRequestId: pr._id,
    fingerprint: finding.fingerprint,
    publishingStatus: 'published',
  });
  if (existingPublished) {
    return { status: 'skipped_duplicate', comment: existingPublished };
  }

  const accessToken = await getUserDecryptedGitHubToken(userId);
  const gh = new GitHubClient(accessToken);

  const body = formatInlineCommentMarkdown({
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    description: finding.description,
    impact: finding.impact,
    recommendation: finding.recommendation,
    suggestedFix: finding.suggestedFix,
    confidenceScore: finding.confidenceScore,
    cwe: finding.cwe,
    owasp: finding.owasp,
    fingerprint: finding.fingerprint,
  });

  const ghComment = await gh.createSingleInlineComment(repo.owner, repo.name, pr.prNumber, {
    commitId: review.headSha,
    path: finding.filePath,
    line: finding.endLine,
    startLine: finding.startLine < finding.endLine ? finding.startLine : undefined,
    body,
  });

  const commentRecord = await ReviewComment.create({
    reviewId: review._id,
    findingId: finding._id,
    pullRequestId: pr._id,
    githubCommentId: ghComment.id,
    filePath: finding.filePath,
    line: finding.endLine,
    commentBody: body,
    fingerprint: finding.fingerprint,
    publishingStatus: 'published',
  });

  finding.status = 'published';
  await finding.save();

  await recordActivity({
    userId,
    repositoryId: repo._id,
    pullRequestId: pr._id,
    eventType: 'finding.published',
    description: `Published finding "${finding.title}" on ${repo.fullName}#${pr.prNumber} (${finding.filePath}:${finding.endLine})`,
    metadata: { findingId: String(finding._id), githubCommentId: ghComment.id },
  });

  return { status: 'published', comment: commentRecord };
}

export async function dismissFinding(
  userId: string,
  findingId: string,
  reason = ''
) {
  if (!Types.ObjectId.isValid(findingId)) {
    throw new NotFoundError('Finding not found');
  }
  const finding = await Finding.findById(findingId);
  if (!finding) throw new NotFoundError('Finding not found');

  const repo = await Repository.findOne({ _id: finding.repositoryId, userId });
  if (!repo) throw new NotFoundError('Finding not found');

  finding.status = 'dismissed';
  finding.dismissReason = reason.slice(0, 500);
  finding.dismissedAt = new Date();
  await finding.save();

  // Recalculate active finding counts on the parent Review document
  const active = await Finding.find({
    reviewId: finding.reviewId,
    status: { $ne: 'dismissed' },
  }).lean();

  await Review.findByIdAndUpdate(finding.reviewId, {
    $set: {
      totalFindings: active.length,
      criticalCount: active.filter((f) => f.severity === 'CRITICAL').length,
      highCount: active.filter((f) => f.severity === 'HIGH').length,
      mediumCount: active.filter((f) => f.severity === 'MEDIUM').length,
      lowCount: active.filter((f) => f.severity === 'LOW').length,
      infoCount: active.filter((f) => f.severity === 'INFO').length,
    },
  });

  await recordActivity({
    userId,
    repositoryId: repo._id,
    pullRequestId: finding.pullRequestId,
    eventType: 'finding.dismissed',
    description: `Dismissed finding "${finding.title}" (${finding.filePath}:${finding.startLine})`,
    metadata: { findingId: String(finding._id), reason },
  });

  return finding.toObject();
}
