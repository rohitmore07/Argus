'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Play,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { api } from '@/services/api';
import { PullRequestRecord, RepositoryRecord } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { RepoSettingsDialog } from '@/components/repositories/RepoSettingsDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedStatusIndicator,
  StaggerContainer,
  StaggerItem,
} from '@/components/motion';

function RepoDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [repo, setRepo] = useState<RepositoryRecord | null>(null);
  const [prs, setPrs] = useState<PullRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [triggeringPrId, setTriggeringPrId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRepositoryDetail(params.id);
      setRepo(res.repository);
      setPrs(res.pullRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSyncFromGitHub = async () => {
    setSyncing(true);
    try {
      const res = await api.syncRepositoryPRs(params.id);
      toast({
        title: 'Synced Pull Requests from GitHub',
        description: `Synchronized ${res.syncedCount} pull requests.`,
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      toast({
        title: 'GitHub sync failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTriggerReview = async (pr: PullRequestRecord) => {
    setTriggeringPrId(pr._id);
    try {
      const res = await api.triggerPullRequestReview(pr._id);
      toast({
        title: `Queued AI review for PR #${pr.prNumber}`,
        description: 'Opening live review monitor...',
        variant: 'success',
      });
      router.push(`/reviews/${res.reviewId}`);
    } catch (err) {
      toast({
        title: 'Failed to enqueue review',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setTriggeringPrId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error || !repo) {
    return <ErrorState message={error || 'Repository not found'} onRetry={() => void loadData()} />;
  }

  return (
    <div className="space-y-6">
      {/* Header Surface */}
      <header className="rounded-2xl border border-border panel-elevated p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-xs">
              <Link
                href="/repositories"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Repositories
              </Link>
              <AnimatedStatusIndicator
                status={repo.isMonitoringEnabled ? 'active' : 'idle'}
                label={repo.isMonitoringEnabled ? 'MONITORING ACTIVE' : 'MONITORING PAUSED'}
                size="xs"
              />
            </div>

            <h1 className="text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl">
              {repo.fullName}
            </h1>

            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3 text-indigo-400" />
                {repo.defaultBranch}
              </span>
              <span>{repo.primaryLanguage}</span>
              <span>Threshold ≥ {repo.reviewSettings.minSeverity}</span>
              <span>Mode: {repo.reviewSettings.reviewMode.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              Policy
            </Button>
            <Button size="sm" onClick={() => void handleSyncFromGitHub()} disabled={syncing}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing GitHub...' : 'Sync Pull Requests'}
            </Button>
          </div>
        </div>
      </header>

      {/* Pull Requests Ledger */}
      {prs.length === 0 ? (
        <EmptyState
          icon={GitPullRequest}
          badge="NO PULL REQUESTS TRACKED"
          title="No Pull Requests tracked for this repository yet"
          description="Sync open Pull Requests directly from GitHub or open a new PR to trigger automatic webhook ingestion."
          action={
            <Button size="sm" onClick={() => void handleSyncFromGitHub()} disabled={syncing}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              Sync Pull Requests from GitHub
            </Button>
          }
        />
      ) : (
        <StaggerContainer className="overflow-hidden rounded-xl border border-border panel-surface divide-y divide-border">
          {prs.map((pr) => {
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
                      <span>
                        {pr.sourceBranch} → {pr.targetBranch}
                      </span>
                      <span>{pr.headSha.slice(0, 7)}</span>
                      <span>
                        <span className="text-emerald-400">+{pr.additions}</span>{' '}
                        <span className="text-red-400">-{pr.deletions}</span> (
                        {pr.changedFilesCount} files)
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
                          Inspect
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      disabled={triggeringPrId === pr._id}
                      onClick={() => void handleTriggerReview(pr)}
                    >
                      <Play className="h-3 w-3" />
                      {triggeringPrId === pr._id ? 'Queueing...' : 'Run AI Review'}
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

      <RepoSettingsDialog
        repo={repo}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => void loadData()}
      />
    </div>
  );
}

export default function RepositoryDetailPage() {
  return (
    <AuthGate>
      <RepoDetailContent />
    </AuthGate>
  );
}
