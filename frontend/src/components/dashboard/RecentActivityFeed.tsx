'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FolderGit2,
  GitPullRequest,
  ShieldCheck,
} from 'lucide-react';
import { ActivityLogRecord } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { StaggerContainer, StaggerItem } from '@/components/motion';

function getEventVisual(eventType: string) {
  if (eventType.includes('failed') || eventType.includes('rejected')) {
    return {
      icon: AlertTriangle,
      nodeClass: 'border-red-500/40 bg-red-500/15 text-red-400',
      label: 'Failed',
    };
  }
  if (eventType.includes('completed') || eventType.includes('published')) {
    return {
      icon: CheckCircle2,
      nodeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
      label: 'Completed',
    };
  }
  if (eventType.includes('awaiting_approval')) {
    return {
      icon: ShieldCheck,
      nodeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
      label: 'Pending Approval',
    };
  }
  if (eventType.includes('repository')) {
    return {
      icon: FolderGit2,
      nodeClass: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-400',
      label: 'Repository',
    };
  }
  if (eventType.includes('review') || eventType.includes('webhook')) {
    return {
      icon: GitPullRequest,
      nodeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-400',
      label: 'Webhook',
    };
  }
  return {
    icon: ShieldCheck,
    nodeClass: 'border-border-strong bg-surface-elevated text-muted-foreground',
    label: 'Event',
  };
}

export function RecentActivityFeed({ items }: { items: ActivityLogRecord[] }) {
  return (
    <section className="rounded-xl border border-border panel-surface p-5 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Live Audit Stream
          </span>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
            Recent Activity Timeline
          </h2>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {items.length} events
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-elevated text-muted-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium text-foreground">Waiting for repository events</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground leading-relaxed">
            Connect a GitHub repository or open a Pull Request to watch live webhook deliveries and
            AI reviews stream here.
          </p>
        </div>
      ) : (
        <StaggerContainer className="relative mt-4 space-y-1 flex-1">
          {/* Vertical hairline timeline spine */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[13px] top-3 bottom-3 w-px bg-border"
          />

          {items.map((item) => {
            const visual = getEventVisual(item.eventType);
            const Icon = visual.icon;
            const reviewId = item.pullRequestId?.latestReviewId;
            const meta = (item.metadata || {}) as Record<string, unknown>;
            const totalFindings =
              typeof meta.totalFindings === 'number' ? meta.totalFindings : null;
            const criticalCount =
              typeof meta.criticalCount === 'number' ? meta.criticalCount : 0;
            const highCount = typeof meta.highCount === 'number' ? meta.highCount : 0;

            return (
              <StaggerItem key={item._id}>
                <div className="group relative flex items-start gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-surface-hover/55">
                  <div
                    className={cn(
                      'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                      visual.nodeClass
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {item.pullRequestId?.title
                          ? `#${item.pullRequestId.prNumber} ${item.pullRequestId.title}`
                          : item.description}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    {item.pullRequestId?.title && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] font-mono">
                      {item.repositoryId?.fullName && (
                        <span className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-muted-foreground">
                          {item.repositoryId.fullName}
                        </span>
                      )}

                      <span className="text-muted-foreground">{visual.label}</span>

                      {totalFindings !== null && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-foreground/85">{totalFindings} issues</span>
                          {criticalCount > 0 && (
                            <span className="rounded bg-red-500/15 px-1 py-0.5 text-red-400">
                              {criticalCount} CRIT
                            </span>
                          )}
                          {highCount > 0 && (
                            <span className="rounded bg-orange-500/15 px-1 py-0.5 text-orange-400">
                              {highCount} HIGH
                            </span>
                          )}
                        </span>
                      )}

                      {reviewId && (
                        <Link
                          href={`/reviews/${reviewId}`}
                          className="ml-auto inline-flex items-center gap-0.5 text-indigo-400 opacity-80 group-hover:opacity-100 hover:underline transition-opacity"
                        >
                          Inspect
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}
    </section>
  );
}
