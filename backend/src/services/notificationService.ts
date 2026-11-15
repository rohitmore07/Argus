import { Types } from 'mongoose';
import { ActivityEventType, ActivityLog, User } from '../models';
import { logger } from '../utils/logger';
import { redactObject } from '../utils/secretRedactor';

/**
 * Validates outbound notification webhook URLs to prevent SSRF against private/loopback networks.
 */
function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function recordActivity(params: {
  userId: Types.ObjectId | string;
  repositoryId?: Types.ObjectId | string | null;
  pullRequestId?: Types.ObjectId | string | null;
  eventType: ActivityEventType;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await ActivityLog.create({
      userId: params.userId,
      repositoryId: params.repositoryId || null,
      pullRequestId: params.pullRequestId || null,
      eventType: params.eventType,
      description: params.description,
      metadata: redactObject(params.metadata || {}),
    });
  } catch (err) {
    logger.warn('Failed to write ActivityLog record', {
      eventType: params.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyReviewEvent(params: {
  userId: Types.ObjectId | string;
  repositoryId: Types.ObjectId | string;
  pullRequestId: Types.ObjectId | string;
  eventType: 'review.completed' | 'review.awaiting_approval' | 'review.failed';
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  criticalCount?: number;
  highCount?: number;
  totalFindings?: number;
  errorMessage?: string;
}): Promise<void> {
  const description =
    params.eventType === 'review.failed'
      ? `Review failed for ${params.repoFullName}#${params.prNumber}: ${params.errorMessage || 'Unknown error'}`
      : params.eventType === 'review.awaiting_approval'
        ? `Review ready for manual approval on ${params.repoFullName}#${params.prNumber} (${params.totalFindings || 0} findings)`
        : `Review completed for ${params.repoFullName}#${params.prNumber} (${params.totalFindings || 0} findings, ${params.criticalCount || 0} critical)`;

  await recordActivity({
    userId: params.userId,
    repositoryId: params.repositoryId,
    pullRequestId: params.pullRequestId,
    eventType: params.eventType,
    description,
    metadata: {
      repoFullName: params.repoFullName,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      totalFindings: params.totalFindings ?? 0,
      criticalCount: params.criticalCount ?? 0,
      highCount: params.highCount ?? 0,
    },
  });

  // Dispatch optional outbound HTTPS webhook notification (e.g. Slack/Discord/custom)
  try {
    const user = await User.findById(params.userId).lean();
    const prefs = user?.notificationPreferences;
    if (!prefs || !prefs.webhookUrl) return;

    if (params.eventType === 'review.failed' && !prefs.notifyOnFailure) return;
    if (params.eventType !== 'review.failed' && !prefs.notifyOnCompletion) return;
    if (
      params.eventType !== 'review.failed' &&
      prefs.notifyOnCriticalOnly &&
      (params.criticalCount || 0) === 0
    ) {
      return;
    }

    if (!isSafeWebhookUrl(prefs.webhookUrl)) {
      logger.warn('Blocked unsafe notification webhook URL (must be public HTTPS)', {
        userId: String(params.userId),
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(prefs.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'PR-Sentinel/1.0' },
      signal: controller.signal,
      body: JSON.stringify({
        text: `[PR Sentinel] ${description}`,
        event: params.eventType,
        repository: params.repoFullName,
        pullRequest: { number: params.prNumber, title: params.prTitle },
        findings: {
          total: params.totalFindings ?? 0,
          critical: params.criticalCount ?? 0,
          high: params.highCount ?? 0,
        },
        timestamp: new Date().toISOString(),
      }),
    });
    clearTimeout(timeout);
  } catch (err) {
    logger.warn('Outbound notification webhook delivery failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
