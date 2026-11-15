'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ExternalLink,
  GitBranch,
  Play,
  RefreshCw,
  Webhook,
} from 'lucide-react';
import { api } from '@/services/api';
import { PullRequestRecord, RepositoryRecord } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedStatusIndicator,
  AnimatedTabs,
  StaggerContainer,
  StaggerItem,
} from '@/components/motion';

function PullRequestsContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<PullRequestRecord[]>([]);
  const [repos, setRepos] = useState<RepositoryRecord[]>([]);
  const [repoFilter, setRepoFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'open' | 'merged' | 'closed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prRes, repoRes] = await Promise.all([
        api.getPullRequests({
          repositoryId: repoFilter || undefined,
          state: stateFilter === 'all' ? undefined : stateFilter,
        }),
        api.getRepositories(),
      ]);
      setItems(prRes.items);
      setRepos(repoRes.repositories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pull requests');
    } finally {
      setLoading(false);
    }
  }, [repoFilter, stateFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRunReview = async (pr: PullRequestRecord) => {
    setTriggeringId(pr._id);
    try {
      const res = await api.triggerPullRequestReview(pr._id);
      toast({
        title: `Queued AI review for #${pr.prNumber}`,
        variant: 'success',
      });
      router.push(`/reviews/${res.reviewId}`);
    } catch (err) {
      toast({
        title: 'Failed to start review',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Multi-Agent Review Queue
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Pull Requests
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Inspect webhook-tracked Pull Requests, review severities, and trigger on-demand Gemini
            code audits.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Sliding Status Tabs + Repository Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AnimatedTabs<'all' | 'open' | 'merged' | 'closed'>
          layoutId="prs-state-tab"
          activeId={stateFilter}
          onChange={setStateFilter}
          tabs={[
            { id: 'all', label: 'All PRs' },
            { id: 'open', label: 'Open' },
            { id: 'merged', label: 'Merged' },
            { id: 'closed', label: 'Closed' },
          ]}
        />

        <select
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
          aria-label="Filter pull requests by repository"
          className="h-9 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All repositories ({repos.length})</option>
          {repos.map((r) => (
            <option key={r._id} value={r._id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void loadData()} />
      ) : loading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Webhook}
          badge="WAITING FOR WEBHOOK EVENTS"
          title="No Pull Requests in queue"
          description="Open a Pull Request on any monitored repository to receive an automated webhook trigger, or sync existing PRs from a repository workspace."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/repositories">Open Repositories</Link>
            </Button>
          }
        />
      ) : (
        <StaggerContainer className="overflow-hidden rounded-xl border border-border panel-surface divide-y divide-border">
          {items.map((pr) => {
            const repoName =
              typeof pr.repositoryId === 'object' ? pr.repositoryId.fullName : 'Repository';
            const latest =
              pr.latestReviewId && typeof pr.latestReviewId === 'object'
                ? pr.latestReviewId
                : null;
            const latestId =
              typeof pr.latestReviewId === 'string'
                ? pr.latestReviewId
                : latest?._id || null;
            const procStatus = latest?.processingStatus;
            const statusTone =
              procStatus === 'failed'
                ? 'critical'
                : procStatus === 'queued' ||
                    procStatus === 'fetching_context' ||
                    procStatus === 'analyzing' ||
                    procStatus === 'validating' ||
                    procStatus === 'publishing'
                  ? 'analyzing'
                  : procStatus === 'awaiting_approval'
                    ? 'warning'
                    : procStatus === 'completed'
                      ? 'active'
                      : 'idle';

            return (
              <StaggerItem key={pr._id}>
                <div className="group flex flex-col gap-3 px-5 py-4 hover:bg-surface-hover/40 transition-colors lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {repoName}
                      </span>
                      <span className="font-mono text-xs font-semibold text-indigo-400">
                        #{pr.prNumber}
                      </span>
                      <span className="text-[13.5px] font-medium text-foreground">{pr.title}</span>
                      <AnimatedStatusIndicator
                        status={statusTone}
                        label={
                          procStatus
                            ? procStatus.replace(/_/g, ' ').toUpperCase()
                            : pr.reviewStatus.replace(/_/g, ' ').toUpperCase()
                        }
                        size="xs"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
                      <span>@{pr.author}</span>
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {pr.sourceBranch} → {pr.targetBranch}
                      </span>
                      <span>
                        <span className="text-emerald-400">+{pr.additions}</span>{' '}
                        <span className="text-red-400">-{pr.deletions}</span>
                      </span>
                      <span>{formatRelativeTime(pr.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {latest && (
                      <div className="mr-1 flex items-center gap-1.5 font-mono text-[10px]">
                        {latest.criticalCount > 0 && (
                          <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-red-400">
                            {latest.criticalCount} CRIT
                          </span>
                        )}
                        {latest.highCount > 0 && (
                          <span className="rounded border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-orange-400">
                            {latest.highCount} HIGH
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {latest.totalFindings} total
                        </span>
                      </div>
                    )}

                    {latestId && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/reviews/${latestId}`}>
                          View Review
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      disabled={triggeringId === pr._id}
                      onClick={() => void handleRunReview(pr)}
                    >
                      <Play className="h-3 w-3" />
                      {triggeringId === pr._id ? 'Queueing...' : 'Review'}
                    </Button>

                    <Button variant="ghost" size="icon" asChild aria-label="Open on GitHub">
                      <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}
    </div>
  );
}

export default function PullRequestsPage() {
  return (
    <AuthGate>
      <PullRequestsContent />
    </AuthGate>
  );
}
