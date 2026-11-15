'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  Code2,
  EyeOff,
  FileCode2,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { FindingRecord } from '@/types';
import { CATEGORY_META, cn, SEVERITY_STYLES } from '@/lib/utils';
import { CodeBlock } from '@/components/common/CodeBlock';
import { AnimatedPresencePanel } from '@/components/motion';

const SEVERITY_RAIL: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-sky-400',
  INFO: 'bg-zinc-500',
};

export function FindingCard({
  finding,
  onPublish,
  onDismiss,
  onJumpToFile,
  defaultExpanded = false,
}: {
  finding: FindingRecord;
  onPublish: (findingId: string) => Promise<void>;
  onDismiss: (findingId: string) => Promise<void>;
  onJumpToFile?: (filePath: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(
    defaultExpanded || finding.severity === 'CRITICAL' || finding.severity === 'HIGH'
  );
  const [busyAction, setBusyAction] = useState<'publish' | 'dismiss' | null>(null);

  const sev = SEVERITY_STYLES[finding.severity];
  const cat = CATEGORY_META[finding.category];
  const railColor = SEVERITY_RAIL[finding.severity] || 'bg-zinc-500';
  const isDismissed = finding.status === 'dismissed';
  const isPublished =
    finding.status === 'published' || finding.commentStatus?.publishingStatus === 'published';

  const handlePublish = async () => {
    setBusyAction('publish');
    try {
      await onPublish(finding._id);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDismiss = async () => {
    setBusyAction('dismiss');
    try {
      await onDismiss(finding._id);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <motion.article
      layout="position"
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border panel-surface transition-all duration-200 hover:border-border-strong',
        isDismissed && 'opacity-55'
      )}
    >
      {/* Left severity hairline rail */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] transition-opacity',
          isDismissed ? 'bg-zinc-600' : railColor
        )}
      />

      {/* Accordion Header Trigger */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-surface-hover/35 transition-colors"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors',
                sev.badge
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', sev.dot)} />
              {sev.label}
            </span>

            <span className="inline-flex items-center rounded-md border border-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {cat.label}
            </span>

            {isPublished && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Published to GitHub
              </span>
            )}

            {isDismissed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Dismissed
              </span>
            )}

            <span className="ml-auto hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              <span>{Math.round(finding.confidenceScore * 100)}% conf</span>
              <span>·</span>
              <span>{finding.agentSource.replace(/_/g, ' ')}</span>
            </span>
          </div>

          <h4 className="text-[13.5px] font-semibold tracking-tight text-foreground leading-snug">
            {finding.title}
          </h4>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-subtle px-2 py-0.5 border border-border/80">
              <FileCode2 className="h-3 w-3 text-indigo-400" />
              <span className="text-foreground/90">{finding.filePath}</span>
              {finding.startLine ? (
                <span className="text-indigo-400">
                  :{finding.startLine}
                  {finding.endLine && finding.endLine !== finding.startLine
                    ? `-${finding.endLine}`
                    : ''}
                </span>
              ) : null}
            </span>
            {finding.cwe && (
              <span className="inline-flex items-center gap-1 text-rose-400">
                <ShieldAlert className="h-3 w-3" />
                {finding.cwe}
              </span>
            )}
            {finding.owasp && <span className="text-muted-foreground">{finding.owasp}</span>}
          </div>
        </div>

        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180 text-foreground'
          )}
        />
      </button>

      {/* Smooth Animated Detail Drawer */}
      <AnimatedPresencePanel open={expanded}>
        <div className="space-y-4 border-t border-border bg-surface-subtle/40 px-5 py-4 text-xs">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Issue Explanation
              </p>
              <p className="text-[12.5px] leading-relaxed text-foreground/90">
                {finding.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Production Impact
              </p>
              <p className="text-[12.5px] leading-relaxed text-foreground/90">{finding.impact}</p>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-3.5">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-indigo-400">
              <Sparkles className="h-3 w-3" />
              Recommended Remediation
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/90">
              {finding.recommendation}
            </p>
          </div>

          {finding.codeSnippet && (
            <CodeBlock
              code={finding.codeSnippet}
              label={`Affected Code · ${finding.filePath}${finding.startLine ? `:${finding.startLine}` : ''}`}
              startLineNumber={finding.startLine}
            />
          )}

          {finding.suggestedFix && (
            <CodeBlock code={finding.suggestedFix} label="Suggested Fix" tone="fix" />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="font-mono text-[10px] text-muted-foreground">
              Validated against changed diff hunks · Confidence{' '}
              {Math.round(finding.confidenceScore * 100)}%
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {onJumpToFile && (
                <button
                  type="button"
                  onClick={() => onJumpToFile(finding.filePath)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
                >
                  <Code2 className="h-3 w-3 text-indigo-400" />
                  Inspect in Diff
                </button>
              )}

              {!isPublished && !isDismissed && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handlePublish()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/35 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3 w-3" />
                  {busyAction === 'publish' ? 'Publishing...' : 'Post Inline Comment'}
                </button>
              )}

              {!isDismissed && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleDismiss()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-border-strong hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  <EyeOff className="h-3 w-3" />
                  {busyAction === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
                </button>
              )}
            </div>
          </div>
        </div>
      </AnimatedPresencePanel>
    </motion.article>
  );
}
