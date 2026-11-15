'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Webhook,
} from 'lucide-react';
import { api } from '@/services/api';
import { RepositoryRecord } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { ConnectRepoDialog } from '@/components/repositories/ConnectRepoDialog';
import { RepoSettingsDialog } from '@/components/repositories/RepoSettingsDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedPresencePanel,
  AnimatedStatusIndicator,
  AnimatedTabs,
  StaggerContainer,
  StaggerItem,
} from '@/components/motion';

function RepositoriesContent() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<RepositoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'monitored' | 'paused'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [settingsRepo, setSettingsRepo] = useState<RepositoryRecord | null>(null);
  const [disconnectRepo, setDisconnectRepo] = useState<RepositoryRecord | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRepositories();
      setRepos(res.repositories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  const monitoredCount = useMemo(
    () => repos.filter((r) => r.isMonitoringEnabled).length,
    [repos]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repos.filter((r) => {
      if (statusFilter === 'monitored' && !r.isMonitoringEnabled) return false;
      if (statusFilter === 'paused' && r.isMonitoringEnabled) return false;
      if (
        q &&
        !r.fullName.toLowerCase().includes(q) &&
        !r.primaryLanguage.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [repos, search, statusFilter]);

  const handleToggleMonitoring = async (repo: RepositoryRecord, enabled: boolean) => {
    try {
      const res = await api.updateRepositorySettings(repo._id, {
        isMonitoringEnabled: enabled,
      });
      setRepos((prev) =>
        prev.map((item) => (item._id === repo._id ? { ...item, ...res.repository } : item))
      );
      toast({
        title: enabled ? 'Monitoring enabled' : 'Monitoring paused',
        description: repo.fullName,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to update monitoring',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectRepo) return;
    setDisconnecting(true);
    try {
      await api.deleteRepository(disconnectRepo._id);
      toast({
        title: 'Repository disconnected',
        description: `Removed webhook and stopped monitoring ${disconnectRepo.fullName}.`,
        variant: 'success',
      });
      setDisconnectRepo(null);
      await loadRepos();
    } catch (err) {
      toast({
        title: 'Failed to disconnect',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editorial Workspace Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            GitHub Fleet · Webhook Integrations
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Repositories
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage connected GitHub repositories, HMAC webhook lifecycles, and per-repo AI review
            policies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadRepos()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setConnectOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Connect Repository
          </Button>
        </div>
      </div>

      {/* Filter & Search Command Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AnimatedTabs<'all' | 'monitored' | 'paused'>
          layoutId="repos-filter-tab"
          activeId={statusFilter}
          onChange={setStatusFilter}
          tabs={[
            { id: 'all', label: 'All', count: repos.length },
            { id: 'monitored', label: 'Monitored', count: monitoredCount },
            { id: 'paused', label: 'Paused', count: repos.length - monitoredCount },
          ]}
        />

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by repo or language..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs bg-surface border-border"
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void loadRepos()} />
      ) : loading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          badge={repos.length === 0 ? 'NO REPOSITORIES CONNECTED' : 'NO MATCHES'}
          title={
            repos.length === 0 ? 'Connect your first GitHub repository' : 'No matching repositories'
          }
          description={
            repos.length === 0
              ? 'Register a GitHub repository to automatically receive Pull Request webhooks and trigger multi-agent Gemini security & bug reviews.'
              : 'Adjust your search query or status filter to view other connected repositories.'
          }
          action={
            repos.length === 0 ? (
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Connect Repository
              </Button>
            ) : undefined
          }
        />
      ) : (
        <StaggerContainer className="space-y-2.5">
          {filtered.map((repo) => {
            const expanded = expandedId === repo._id;
            return (
              <StaggerItem key={repo._id}>
                <motion.div
                  layout="position"
                  className="group overflow-hidden rounded-xl border border-border panel-surface transition-colors hover:border-border-strong"
                >
                  <div className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left Identity & Expand Trigger */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : repo._id)}
                        aria-label={`Expand details for ${repo.fullName}`}
                        className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
                      >
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform duration-200',
                            expanded && 'rotate-180 text-foreground'
                          )}
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/repositories/${repo._id}`}
                            className="truncate text-[13.5px] font-semibold tracking-tight text-foreground hover:text-indigo-400 transition-colors"
                          >
                            {repo.fullName}
                          </Link>
                          <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                            {repo.isPrivate ? (
                              <Lock className="h-2.5 w-2.5" />
                            ) : (
                              <Globe className="h-2.5 w-2.5" />
                            )}
                            {repo.isPrivate ? 'Private' : 'Public'}
                          </span>
                          <span className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                            {repo.primaryLanguage}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {repo.defaultBranch}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Webhook className="h-3 w-3" />
                            Webhook: {repo.webhookStatus}
                          </span>
                          <span>
                            {repo.stats?.totalPRsReviewed ?? 0} PRs ·{' '}
                            {repo.stats?.totalIssuesDetected ?? 0} findings
                          </span>
                          <span>
                            Last review:{' '}
                            {formatRelativeTime(
                              repo.stats?.lastReviewDate || repo.lastReviewedAt
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Monitoring Toggle & Hover-Revealed Secondary Actions */}
                    <div className="flex items-center justify-between gap-4 pl-8 lg:justify-end lg:pl-0">
                      <div className="flex items-center gap-1.5 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity duration-150">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSettingsRepo(repo)}
                          className="h-7 px-2 text-[11px]"
                        >
                          <Settings2 className="h-3 w-3" />
                          Policy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDisconnectRepo(repo)}
                          className="h-7 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3 w-3" />
                          Disconnect
                        </Button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <AnimatedStatusIndicator
                            status={repo.isMonitoringEnabled ? 'active' : 'idle'}
                            size="xs"
                          />
                          <Switch
                            checked={repo.isMonitoringEnabled}
                            onCheckedChange={(checked) => void handleToggleMonitoring(repo, checked)}
                            aria-label={`Toggle monitoring for ${repo.fullName}`}
                          />
                        </div>

                        <Button variant="outline" size="sm" asChild className="h-7 px-2.5 text-[11px]">
                          <Link href={`/repositories/${repo._id}`}>
                            Open
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Inline Policy Summary */}
                  <AnimatedPresencePanel open={expanded}>
                    <div className="grid grid-cols-1 gap-4 border-t border-border bg-surface-subtle/50 px-5 py-3.5 text-xs sm:grid-cols-3">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Review Mode &amp; Threshold
                        </span>
                        <p className="mt-1 font-mono text-[11px] text-foreground">
                          {repo.reviewSettings.reviewMode.replace(/_/g, ' ')} · ≥{' '}
                          {repo.reviewSettings.minSeverity}
                          {repo.reviewSettings.requireManualApproval ? ' · Manual approval' : ''}
                        </p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Active Agents
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px]">
                          {repo.reviewSettings.enableSecurityAnalysis && (
                            <span className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
                              Security
                            </span>
                          )}
                          {repo.reviewSettings.enableBugDetection && (
                            <span className="rounded border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-orange-400">
                              Bugs
                            </span>
                          )}
                          {repo.reviewSettings.enablePerformanceAnalysis && (
                            <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-violet-400">
                              Perf
                            </span>
                          )}
                          {repo.reviewSettings.enableCodeQualityAnalysis && (
                            <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-sky-400">
                              Quality
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Ignored Paths
                        </span>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {(repo.reviewSettings.ignoredPaths || []).join(', ') || 'Default'}
                        </p>
                      </div>
                    </div>
                  </AnimatedPresencePanel>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      <ConnectRepoDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={() => void loadRepos()}
      />

      <RepoSettingsDialog
        repo={settingsRepo}
        open={Boolean(settingsRepo)}
        onOpenChange={(open) => !open && setSettingsRepo(null)}
        onSaved={() => void loadRepos()}
      />

      <ConfirmDialog
        open={Boolean(disconnectRepo)}
        onOpenChange={(open) => !open && setDisconnectRepo(null)}
        title={`Disconnect ${disconnectRepo?.fullName}?`}
        description="PR Sentinel will delete its GitHub webhook and stop reviewing new Pull Requests for this repository. Historical review data remains in MongoDB."
        confirmLabel="Disconnect Repository"
        variant="destructive"
        loading={disconnecting}
        onConfirm={() => void handleDisconnect()}
      />
    </div>
  );
}

export default function RepositoriesPage() {
  return (
    <AuthGate>
      <RepositoriesContent />
    </AuthGate>
  );
}
