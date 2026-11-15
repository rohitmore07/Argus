'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Bug,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/services/api';
import {
  FindingCategory,
  FindingRecord,
  PullRequestRecord,
  RepositoryRecord,
  ReviewProcessingStatus,
  ReviewRecord,
  Severity,
} from '@/types';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { FindingCard } from '@/components/reviews/FindingCard';
import { DiffViewer } from '@/components/reviews/DiffViewer';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedCounter,
  AnimatedStatusIndicator,
  AnimatedTabs,
} from '@/components/motion';
import { EASE_OUT_EXPO } from '@/components/motion/variants';

const RUNNING_STATUSES: ReviewProcessingStatus[] = [
  'queued',
  'fetching_context',
  'analyzing',
  'validating',
  'publishing',
];

function ActiveReviewPipelineStage({ status }: { status: ReviewProcessingStatus }) {
  const order: ReviewProcessingStatus[] = [
    'queued',
    'fetching_context',
    'analyzing',
    'validating',
    'publishing',
  ];
  const currentIdx = Math.max(0, order.indexOf(status));

  const steps = [
    { label: 'Fetch GitHub Diff & Context', idx: 1 },
    { label: 'Static Patterns, OSV CVE & Gemini Agents', idx: 2 },
    { label: 'Diff-Hunk Line Grounding & Deduplication', idx: 3 },
    { label: 'Finalize & Prepare GitHub Comments', idx: 4 },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className="relative overflow-hidden rounded-2xl border border-indigo-500/30 panel-elevated p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sentinel-grid opacity-60"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] overflow-hidden"
      >
        <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scanline" />
      </div>

      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <AnimatedStatusIndicator
            status="analyzing"
            label={`STAGE · ${status.replace(/_/g, ' ').toUpperCase()}`}
            size="sm"
          />
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            PR Sentinel is auditing this Pull Request live
          </h2>
          <p className="max-w-xl text-xs text-muted-foreground leading-relaxed">
            Polling MongoDB status automatically every 3 seconds until all specialist agents finish
            grounding findings against changed lines.
          </p>
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-400">
          <Cpu className="h-6 w-6 animate-pulse" />
        </div>
      </div>

      <div className="relative z-10 mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => {
          const done = currentIdx > step.idx;
          const active = currentIdx === step.idx || (currentIdx === 0 && i === 0);
          return (
            <div
              key={step.label}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-xs transition-colors',
                active
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-foreground'
                  : done
                    ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300'
                    : 'border-border bg-surface/70 text-muted-foreground'
              )}
            >
              <div className="flex items-center gap-2 font-mono text-[10px] mb-1">
                <span>0{i + 1}</span>
                <span>{done ? 'DONE' : active ? 'RUNNING...' : 'PENDING'}</span>
              </div>
              <p className="font-medium leading-snug">{step.label}</p>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function ReviewDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'diff'>('findings');
  const [focusedDiffFile, setFocusedDiffFile] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<FindingCategory | 'ALL'>('ALL');
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'comment_only' | 'request_changes'>('comment_only');
  const [regenerating, setRegenerating] = useState(false);
  const [shaCopied, setShaCopied] = useState(false);

  const loadReview = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getReviewDetail(params.id);
      setReview(res.review);
      setFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  useEffect(() => {
    if (!review) return;
    if (RUNNING_STATUSES.includes(review.processingStatus)) {
      const interval = setInterval(() => void loadReview(), 3000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [review, loadReview]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
      return true;
    });
  }, [findings, severityFilter, categoryFilter]);

  const activeFindings = useMemo(
    () => findings.filter((f) => f.status !== 'dismissed'),
    [findings]
  );

  const securityCount = useMemo(
    () => activeFindings.filter((f) => f.category === 'security').length,
    [activeFindings]
  );

  const bugCount = useMemo(
    () => activeFindings.filter((f) => f.category === 'bug').length,
    [activeFindings]
  );

  const handlePublishFinding = async (findingId: string) => {
    try {
      await api.publishFinding(findingId);
      toast({
        title: 'Inline comment published to GitHub',
        variant: 'success',
      });
      await loadReview();
    } catch (err) {
      toast({
        title: 'Failed to publish comment',
        description: err instanceof Error ? err.message : 'GitHub API error',
        variant: 'error',
      });
    }
  };

  const handleDismissFinding = async (findingId: string) => {
    try {
      await api.dismissFinding(findingId, 'Dismissed in PR Sentinel dashboard');
      toast({
        title: 'Finding dismissed',
        variant: 'success',
      });
      await loadReview();
    } catch (err) {
      toast({
        title: 'Unable to dismiss finding',
        description: err instanceof Error ? err.message : 'Request failed',
        variant: 'error',
      });
    }
  };

  const handlePublishReview = async (mode: 'comment_only' | 'request_changes') => {
    setPublishing(true);
    try {
      const res = await api.publishReview(params.id, { reviewMode: mode });
      toast({
        title: 'Review published to GitHub',
        description: `Posted ${res.publishedCount} inline comments (${res.skippedDuplicates} duplicates skipped).`,
        variant: 'success',
      });
      setPublishDialogOpen(false);
      await loadReview();
    } catch (err) {
      toast({
        title: 'Failed to publish to GitHub',
        description: err instanceof Error ? err.message : 'GitHub API error',
        variant: 'error',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleRegenerate = async () => {
    if (!review) return;
    const prId =
      typeof review.pullRequestId === 'object' ? review.pullRequestId._id : review.pullRequestId;
    setRegenerating(true);
    try {
      const res = await api.triggerPullRequestReview(prId);
      toast({
        title: 'Fresh AI review queued',
        description: 'Redirecting to the new review run...',
        variant: 'success',
      });
      router.push(`/reviews/${res.reviewId}`);
    } catch (err) {
      toast({
        title: 'Regeneration failed',
        description: err instanceof Error ? err.message : 'Unable to enqueue job',
        variant: 'error',
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha);
      setShaCopied(true);
      setTimeout(() => setShaCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleJumpToDiff = (filePath: string) => {
    setFocusedDiffFile(filePath);
    setActiveTab('diff');
    setTimeout(() => {
      const el = document.getElementById(`diff-file-${encodeURIComponent(filePath)}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !review) {
    return <ErrorState message={error || 'Review not found'} onRetry={() => void loadReview()} />;
  }

  const pr =
    typeof review.pullRequestId === 'object' ? (review.pullRequestId as PullRequestRecord) : null;
  const repo =
    typeof review.repositoryId === 'object' ? (review.repositoryId as RepositoryRecord) : null;
  const diffFiles = pr?.changedFiles || [];

  const durationMs =
    review.startedAt && review.completedAt
      ? new Date(review.completedAt).getTime() - new Date(review.startedAt).getTime()
      : undefined;

  const isRunning = RUNNING_STATUSES.includes(review.processingStatus);
  const statusTone =
    review.processingStatus === 'failed'
      ? 'critical'
      : isRunning
        ? 'analyzing'
        : review.processingStatus === 'awaiting_approval'
          ? 'warning'
          : 'active';

  const riskLabel =
    review.criticalCount > 0
      ? 'CRITICAL'
      : review.highCount > 0
        ? 'HIGH'
        : review.mediumCount > 0
          ? 'MEDIUM'
          : 'LOW';

  const riskStyles =
    riskLabel === 'CRITICAL'
      ? {
          rail: 'bg-red-500',
          badge: 'border-red-500/35 bg-red-500/15 text-red-400',
        }
      : riskLabel === 'HIGH'
        ? {
            rail: 'bg-orange-500',
            badge: 'border-orange-500/35 bg-orange-500/15 text-orange-400',
          }
        : riskLabel === 'MEDIUM'
          ? {
              rail: 'bg-amber-400',
              badge: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
            }
          : {
              rail: 'bg-emerald-500',
              badge: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-400',
            };

  const nextSteps =
    review.summary?.recommendedNextSteps && review.summary.recommendedNextSteps.length > 0
      ? review.summary.recommendedNextSteps
      : activeFindings.length === 0
        ? ['No actionable findings detected. Proceed with standard human code review on GitHub.']
        : ['Review findings below, dismiss any false positives, then publish validated inline comments to GitHub.'];

  const isPublished = Boolean(review.githubReviewId);

  return (
    <div className="space-y-6">
      {/* 1. Animated Review Header */}
      <header className="relative overflow-hidden rounded-2xl border border-border panel-elevated p-5 md:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-sentinel-grid opacity-45 [mask-image:radial-gradient(ellipse_60%_70%_at_90%_0%,#000_10%,transparent_100%)]"
        />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <Link
                href="/pull-requests"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Pull Requests
              </Link>
              {repo && <span className="font-mono text-muted-foreground">{repo.fullName}</span>}
              <span className="text-border-strong">·</span>
              <AnimatedStatusIndicator
                status={statusTone}
                label={review.processingStatus.replace(/_/g, ' ').toUpperCase()}
                size="xs"
              />
            </div>

            <h1 className="text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl leading-snug">
              {pr ? (
                <>
                  <span className="font-mono text-indigo-400 mr-2">#{pr.prNumber}</span>
                  {pr.title}
                </>
              ) : (
                `Review ${review._id.slice(-8)}`
              )}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
              {pr && <span>by @{pr.author}</span>}
              {pr && (
                <span className="inline-flex items-center gap-1 text-foreground/80">
                  <GitBranch className="h-3 w-3 text-indigo-400" />
                  {pr.sourceBranch} → {pr.targetBranch}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleCopySha(review.headSha)}
                className="inline-flex items-center gap-1 rounded border border-border bg-surface-subtle px-1.5 py-0.5 hover:border-border-strong hover:text-foreground transition-colors"
              >
                <span>{review.headSha.slice(0, 7)}</span>
                {shaCopied ? (
                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </button>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(durationMs)}
              </span>
              {pr && (
                <span>
                  {review.filesAnalyzed} files ·{' '}
                  <span className="text-emerald-400">+{pr.additions}</span>{' '}
                  <span className="text-red-400">-{pr.deletions}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {pr?.htmlUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  GitHub PR
                </a>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={regenerating}
              onClick={() => void handleRegenerate()}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')} />
              Re-run AI
            </Button>

            {!isRunning && review.processingStatus !== 'failed' && (
              <Button
                size="sm"
                disabled={publishing || isPublished}
                onClick={() => {
                  setPublishMode(
                    review.criticalCount > 0 || review.highCount > 0
                      ? 'request_changes'
                      : 'comment_only'
                  );
                  setPublishDialogOpen(true);
                }}
              >
                <Send className="h-3.5 w-3.5" />
                {isPublished ? 'Published' : 'Publish to GitHub'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Live Analyzing Pipeline Stage OR Failed State */}
      {isRunning && <ActiveReviewPipelineStage status={review.processingStatus} />}

      {review.processingStatus === 'failed' && (
        <div className="relative overflow-hidden rounded-xl border border-red-500/30 bg-red-500/[0.05] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Review pipeline failed</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {review.errorMessage || 'An unexpected error interrupted analysis.'}
                </p>
              </div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => void handleRegenerate()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Analysis
            </Button>
          </div>
        </div>
      )}

      {/* 3. Distinctive Editorial AI Review Summary */}
      {!isRunning && (
        <section className="relative overflow-hidden rounded-2xl border border-border panel-surface">
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 w-[3px]', riskStyles.rail)}
          />

          <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            {/* Left Executive Narrative & Specialist Highlights */}
            <div className="p-6 lg:col-span-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    AI Review Briefing · {review.llmModel || 'gemini-2.5-flash'}
                  </span>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
                    riskStyles.badge
                  )}
                >
                  Risk Posture: {riskLabel}
                </span>
              </div>

              <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/90">
                {review.summary?.overview || 'Analysis completed with no additional commentary.'}
              </div>

              {/* Specialist Agent Mini-Briefs */}
              {(review.summary?.securitySummary || review.summary?.bugSummary) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {review.summary.securitySummary && (
                    <div className="rounded-lg border border-border bg-surface-subtle/60 p-3 text-xs">
                      <span className="font-mono text-[10px] uppercase text-rose-400">
                        Security Posture
                      </span>
                      <p className="mt-1 text-muted-foreground leading-relaxed">
                        {review.summary.securitySummary}
                      </p>
                    </div>
                  )}
                  {review.summary.bugSummary && (
                    <div className="rounded-lg border border-border bg-surface-subtle/60 p-3 text-xs">
                      <span className="font-mono text-[10px] uppercase text-orange-400">
                        Reliability &amp; Bugs
                      </span>
                      <p className="mt-1 text-muted-foreground leading-relaxed">
                        {review.summary.bugSummary}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Next Steps */}
              <div className="rounded-lg border border-border bg-surface-subtle/75 p-4 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Suggested Next Steps
                </p>
                <ul className="space-y-1.5">
                  {nextSteps.map((step) => (
                    <li
                      key={step}
                      className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right Precision Counts & Telemetry */}
            <div className="bg-surface-subtle/40 p-6 lg:col-span-4 flex flex-col justify-between gap-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    Total Findings
                  </span>
                  <AnimatedCounter
                    value={review.totalFindings}
                    className="mt-1 block text-2xl font-semibold text-foreground"
                  />
                </div>
                <div
                  className={cn(
                    'rounded-lg border p-3.5',
                    review.criticalCount > 0
                      ? 'border-red-500/30 bg-red-500/[0.06]'
                      : 'border-border bg-surface'
                  )}
                >
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                    <AlertOctagon className="h-3 w-3 text-red-400" />
                    Critical
                  </span>
                  <AnimatedCounter
                    value={review.criticalCount}
                    className={cn(
                      'mt-1 block text-2xl font-semibold',
                      review.criticalCount > 0 ? 'text-red-400' : 'text-foreground'
                    )}
                  />
                </div>
                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                    <ShieldAlert className="h-3 w-3 text-rose-400" />
                    Security
                  </span>
                  <AnimatedCounter
                    value={securityCount}
                    className="mt-1 block text-2xl font-semibold text-foreground"
                  />
                </div>
                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                    <Bug className="h-3 w-3 text-orange-400" />
                    Bugs
                  </span>
                  <AnimatedCounter
                    value={bugCount}
                    className="mt-1 block text-2xl font-semibold text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>High / Medium / Low</span>
                  <span className="text-foreground tabular-nums">
                    {review.highCount} / {review.mediumCount} / {review.lowCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GitHub Sync</span>
                  <span className={isPublished ? 'text-emerald-400' : 'text-amber-400'}>
                    {isPublished
                      ? `Published (${formatRelativeTime(review.completedAt)})`
                      : 'Not yet published'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Auto-Merge Protection</span>
                  <span className="text-emerald-400">Enforced</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Sliding Mode Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AnimatedTabs<'findings' | 'diff'>
          layoutId="review-workspace-tab"
          activeId={activeTab}
          onChange={setActiveTab}
          tabs={[
            {
              id: 'findings',
              label: 'Findings Explorer',
              count: findings.length,
              icon: <ShieldAlert className="h-3.5 w-3.5" />,
            },
            {
              id: 'diff',
              label: 'Code Diff & Inline Annotations',
              count: diffFiles.length,
              icon: <FileCode2 className="h-3.5 w-3.5" />,
            },
          ]}
        />

        {activeTab === 'findings' && findings.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'ALL')}
              aria-label="Filter findings by severity"
              className="h-8 rounded-md border border-border bg-surface px-2.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="INFO">Info</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as FindingCategory | 'ALL')}
              aria-label="Filter findings by category"
              className="h-8 rounded-md border border-border bg-surface px-2.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Agents</option>
              <option value="security">Security</option>
              <option value="bug">Bug</option>
              <option value="performance">Performance</option>
              <option value="code_quality">Code Quality</option>
            </select>
          </div>
        )}
      </div>

      {/* 5. Animated Workspace Content Switcher */}
      <AnimatePresence mode="wait">
        {activeTab === 'findings' ? (
          <motion.div
            key="findings-pane"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            className="space-y-3"
          >
            {filteredFindings.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.035] px-6 py-12 text-center">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-sentinel-dots opacity-45"
                />
                <div className="relative z-10 mx-auto max-w-md flex flex-col items-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {findings.length === 0
                      ? 'Clean Pass — No Issues Detected'
                      : 'No Findings Match Current Filters'}
                  </h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    {findings.length === 0
                      ? 'All specialist agents and deterministic security checks inspected the diff hunks without flagging actionable issues.'
                      : 'Reset the severity or agent filter above to view all review findings.'}
                  </p>
                </div>
              </div>
            ) : (
              filteredFindings.map((finding: FindingRecord, idx: number) => (
                <FindingCard
                  key={finding._id}
                  finding={finding}
                  onPublish={handlePublishFinding}
                  onDismiss={handleDismissFinding}
                  onJumpToFile={handleJumpToDiff}
                  defaultExpanded={idx === 0}
                />
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="diff-pane"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
          >
            <DiffViewer
              files={diffFiles}
              findings={findings}
              focusedFile={focusedDiffFile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Explicit GitHub Publish Modal (COMMENT vs REQUEST_CHANGES — NEVER auto-approves) */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-indigo-400" />
              Publish Review to GitHub
            </DialogTitle>
            <DialogDescription>
              Select how PR Sentinel submits its summary and validated inline comments to{' '}
              <span className="font-mono text-foreground">
                {repo ? `${repo.fullName}#${pr?.prNumber ?? ''}` : 'this Pull Request'}
              </span>
              . PR Sentinel never automatically approves or merges Pull Requests.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPublishMode('comment_only')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                publishMode === 'comment_only'
                  ? 'border-indigo-400/60 bg-indigo-500/10'
                  : 'border-border bg-surface hover:border-border-strong'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-foreground">COMMENT</span>
                {publishMode === 'comment_only' && (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                Posts summary and inline code comments without formally blocking merge.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPublishMode('request_changes')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                publishMode === 'request_changes'
                  ? 'border-orange-400/60 bg-orange-500/10'
                  : 'border-border bg-surface hover:border-border-strong'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-foreground">
                  REQUEST_CHANGES
                </span>
                {publishMode === 'request_changes' && (
                  <CheckCircle2 className="h-4 w-4 text-orange-400" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                Formally requests changes on GitHub until critical/high issues are addressed.
              </p>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={publishing} onClick={() => void handlePublishReview(publishMode)}>
              <Send className="h-3.5 w-3.5" />
              {publishing
                ? 'Publishing...'
                : `Submit ${publishMode === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReviewDetailPage() {
  return (
    <AuthGate>
      <ReviewDetailContent />
    </AuthGate>
  );
}
