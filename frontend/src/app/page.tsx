'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertOctagon,
  ArrowRight,
  ArrowUpRight,
  Bug,
  FolderGit2,
  GitPullRequest,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';
import {
  ActivityLogRecord,
  DashboardAnalytics,
  DashboardStats,
  RepositoryRecord,
} from '@/types';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import { AuthGate } from '@/components/auth/AuthGate';
import { SystemStatusBanner } from '@/components/layout/SystemStatusBanner';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedCounter,
  AnimatedStatusIndicator,
  HoverCard,
  StaggerContainer,
  StaggerItem,
} from '@/components/motion';
import { EASE_OUT_EXPO } from '@/components/motion/variants';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getPostureMessage(stats: DashboardStats | null): {
  headline: string;
  tone: 'active' | 'warning' | 'critical' | 'analyzing';
} {
  if (!stats) {
    return { headline: 'Synchronizing repository security telemetry from MongoDB...', tone: 'analyzing' };
  }
  if (stats.processingStats.inProgress > 0) {
    return {
      headline: `${stats.processingStats.inProgress} Pull Request review(s) actively running across specialist AI agents.`,
      tone: 'analyzing',
    };
  }
  if (stats.criticalIssuesDetected > 0) {
    return {
      headline: `${stats.criticalIssuesDetected} critical finding(s) require immediate engineering remediation before merge.`,
      tone: 'critical',
    };
  }
  if (stats.highSeverityIssues > 0) {
    return {
      headline: `Zero critical vulnerabilities — ${stats.highSeverityIssues} high-severity issue(s) flagged for review.`,
      tone: 'warning',
    };
  }
  if (stats.totalConnectedRepositories === 0) {
    return {
      headline: 'Connect your first GitHub repository to activate continuous webhook security & bug monitoring.',
      tone: 'active',
    };
  }
  return {
    headline: `Monitoring ${stats.activeMonitoredRepositories} of ${stats.totalConnectedRepositories} connected repositories with zero open critical blockers.`,
    tone: 'active',
  };
}

function DashboardContent() {
  const { user, health } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [activity, setActivity] = useState<ActivityLogRecord[]>([]);
  const [repos, setRepos] = useState<RepositoryRecord[]>([]);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, analyticsRes, activityRes, reposRes] = await Promise.all([
        api.getDashboardStats(),
        api.getDashboardAnalytics(days),
        api.getDashboardActivity(1, 10),
        api.getRepositories(),
      ]);
      setStats(statsRes);
      setAnalytics(analyticsRes);
      setActivity(activityRes.items);
      setRepos(reposRes.repositories.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard telemetry');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const posture = getPostureMessage(stats);
  const firstName = user?.name?.split(' ')[0] || user?.githubUsername || 'Engineer';

  const totalSev =
    (stats?.criticalIssuesDetected ?? 0) +
    (stats?.highSeverityIssues ?? 0) +
    (stats?.mediumSeverityIssues ?? 0) +
    (stats?.lowSeverityIssues ?? 0) +
    (stats?.infoSeverityIssues ?? 0);

  const sevSegments = [
    { key: 'critical', count: stats?.criticalIssuesDetected ?? 0, color: 'bg-red-500', label: 'Critical' },
    { key: 'high', count: stats?.highSeverityIssues ?? 0, color: 'bg-orange-500', label: 'High' },
    { key: 'medium', count: stats?.mediumSeverityIssues ?? 0, color: 'bg-amber-400', label: 'Medium' },
    { key: 'low', count: stats?.lowSeverityIssues ?? 0, color: 'bg-sky-400', label: 'Low' },
    { key: 'info', count: stats?.infoSeverityIssues ?? 0, color: 'bg-zinc-500', label: 'Info' },
  ];

  return (
    <div className="space-y-6">
      <SystemStatusBanner health={health} />

      {/* 1. Editorial Workspace Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border panel-elevated">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-sentinel-grid opacity-75 [mask-image:radial-gradient(ellipse_70%_80%_at_80%_0%,#000_15%,transparent_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent animate-scanline" />
        </div>

        <div className="relative z-10 flex flex-col gap-5 p-6 md:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/90 px-3 py-1">
              <AnimatedStatusIndicator
                status={posture.tone}
                label={
                  stats?.processingStats.inProgress
                    ? `${stats.processingStats.inProgress} REVIEWING LIVE`
                    : stats?.processingStats.queue.connected
                      ? 'BULLMQ PIPELINE ONLINE'
                      : 'MONITORING WORKSPACE'
                }
                size="xs"
              />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[28px]">
                {getGreeting()}, {firstName}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {posture.headline}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Sync
            </Button>
            {stats && stats.totalConnectedRepositories > 0 ? (
              <Button size="sm" asChild>
                <Link href="/pull-requests">
                  Review Pull Requests
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/repositories">
                  <Plus className="h-3.5 w-3.5" />
                  Connect Repository
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {error ? (
        <ErrorState message={error} onRetry={() => void loadData()} />
      ) : loading && !stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Skeleton className="h-44 lg:col-span-5" />
            <Skeleton className="h-44 lg:col-span-7" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Skeleton className="h-80 lg:col-span-7" />
            <Skeleton className="h-80 lg:col-span-5" />
          </div>
        </div>
      ) : (
        <StaggerContainer className="space-y-6">
          {/* 2. Asymmetric Telemetry Metrics Band (distinct visual treatments, NOT cookie-cutter cards) */}
          <StaggerItem>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Primary Focal Review Throughput Surface */}
              <HoverCard className="p-5 lg:col-span-5 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Pull Requests Reviewed
                    </span>
                    <div className="mt-2 flex items-baseline gap-3">
                      <AnimatedCounter
                        value={stats?.totalPullRequestsReviewed ?? 0}
                        className="text-4xl font-semibold tracking-[-0.04em] text-foreground"
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        / {stats?.totalPullRequestsTracked ?? 0} tracked
                      </span>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-400/25 bg-indigo-500/10 text-indigo-400">
                    <GitPullRequest className="h-4 w-4" />
                  </div>
                </div>

                {/* Inline pipeline telemetry strip */}
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 font-mono">
                  <div>
                    <span className="block text-[10px] uppercase text-muted-foreground">Repos</span>
                    <span className="mt-0.5 block text-sm font-semibold text-foreground tabular-nums">
                      {stats?.activeMonitoredRepositories ?? 0}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        /{stats?.totalConnectedRepositories ?? 0}
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-muted-foreground">Avg Speed</span>
                    <span className="mt-0.5 block text-sm font-semibold text-foreground tabular-nums">
                      {formatDuration(stats?.processingStats.avgDurationMs)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-muted-foreground">Approval</span>
                    <span className="mt-0.5 block text-sm font-semibold text-amber-400 tabular-nums">
                      {stats?.processingStats.awaitingApproval ?? 0}
                    </span>
                  </div>
                </div>
              </HoverCard>

              {/* Right Split Risk & Findings Matrix */}
              <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-border panel-surface overflow-hidden">
                <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 flex-1">
                  {/* Critical Findings — distinct crimson/emerald semantic treatment */}
                  <div
                    className={cn(
                      'p-5 transition-colors',
                      (stats?.criticalIssuesDetected ?? 0) > 0
                        ? 'bg-red-500/[0.05]'
                        : 'bg-emerald-500/[0.025]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Critical Findings
                      </span>
                      {(stats?.criticalIssuesDetected ?? 0) > 0 ? (
                        <AlertOctagon className="h-4 w-4 text-red-400" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="mt-3">
                      <AnimatedCounter
                        value={stats?.criticalIssuesDetected ?? 0}
                        className={cn(
                          'text-3xl font-semibold tracking-[-0.03em]',
                          (stats?.criticalIssuesDetected ?? 0) > 0
                            ? 'text-red-400'
                            : 'text-emerald-400'
                        )}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {(stats?.criticalIssuesDetected ?? 0) > 0
                        ? `${stats?.highSeverityIssues ?? 0} additional high severity`
                        : 'No critical merge blockers'}
                    </p>
                  </div>

                  {/* Security Issues */}
                  <div className="p-5 hover:bg-surface-hover/35 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Security Issues
                      </span>
                      <ShieldAlert className="h-4 w-4 text-rose-400" />
                    </div>
                    <div className="mt-3">
                      <AnimatedCounter
                        value={stats?.securityVulnerabilitiesDetected ?? 0}
                        className="text-3xl font-semibold tracking-[-0.03em] text-foreground"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      OWASP Top 10 &amp; static checks
                    </p>
                  </div>

                  {/* Bugs Detected */}
                  <div className="p-5 hover:bg-surface-hover/35 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Bugs Detected
                      </span>
                      <Bug className="h-4 w-4 text-orange-400" />
                    </div>
                    <div className="mt-3">
                      <AnimatedCounter
                        value={stats?.totalBugsDetected ?? 0}
                        className="text-3xl font-semibold tracking-[-0.03em] text-foreground"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {stats?.performanceIssuesDetected ?? 0} perf ·{' '}
                      {stats?.codeQualityIssuesDetected ?? 0} quality
                    </p>
                  </div>
                </div>

                {/* Proportional Severity Spectrum Bar */}
                <div className="border-t border-border bg-surface-subtle/60 px-5 py-3">
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
                    <span>SEVERITY SPECTRUM ({totalSev} ACTIVE FINDINGS)</span>
                    <div className="hidden sm:flex items-center gap-3">
                      {sevSegments.map((s) => (
                        <span key={s.key} className="inline-flex items-center gap-1">
                          <span className={cn('h-1.5 w-1.5 rounded-full', s.color)} />
                          <span>
                            {s.label}: <strong className="text-foreground">{s.count}</strong>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    {totalSev > 0 &&
                      sevSegments.map((s) =>
                        s.count > 0 ? (
                          <motion.div
                            key={s.key}
                            initial={{ width: 0 }}
                            animate={{ width: `${(s.count / totalSev) * 100}%` }}
                            transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
                            className={cn('h-full', s.color)}
                          />
                        ) : null
                      )}
                  </div>
                </div>
              </div>
            </div>
          </StaggerItem>

          {/* 3. Main Split Canvas: Insights + Monitored Repos Pulse (Left) & Editorial Timeline (Right) */}
          <StaggerItem>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-7">
                <DashboardCharts
                  analytics={analytics}
                  days={days}
                  onDaysChange={setDays}
                />

                {/* Connected Repositories Quick Pulse */}
                <section className="rounded-xl border border-border panel-surface p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3.5">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Monitored Fleet
                      </span>
                      <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
                        Connected Repositories
                      </h2>
                    </div>
                    <Link
                      href="/repositories"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:underline"
                    >
                      Manage all
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {repos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-9 text-center">
                      <FolderGit2 className="mb-2 h-5 w-5 text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground">
                        No repositories connected yet.
                      </p>
                      <Button variant="outline" size="sm" asChild className="mt-3">
                        <Link href="/repositories">Connect GitHub Repository</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 divide-y divide-border/70">
                      {repos.map((repo) => (
                        <Link
                          key={repo._id}
                          href={`/repositories/${repo._id}`}
                          className="group flex items-center justify-between gap-3 py-3 transition-colors hover:px-2 hover:-mx-2 hover:rounded-lg hover:bg-surface-hover/50"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AnimatedStatusIndicator
                              status={repo.isMonitoringEnabled ? 'active' : 'idle'}
                              size="xs"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground group-hover:text-indigo-400 transition-colors">
                                {repo.fullName}
                              </p>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {repo.primaryLanguage} · {repo.reviewSettings.reviewMode} · last{' '}
                                {formatRelativeTime(
                                  repo.stats?.lastReviewDate || repo.lastReviewedAt
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 font-mono text-[11px] tabular-nums">
                            <span className="text-muted-foreground">
                              {repo.stats?.totalPRsReviewed ?? 0} PRs
                            </span>
                            <span className="text-foreground">
                              {repo.stats?.totalIssuesDetected ?? 0} findings
                            </span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="lg:col-span-5">
                <RecentActivityFeed items={activity} />
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}
