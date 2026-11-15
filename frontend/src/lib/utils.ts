import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FindingCategory, Severity } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'Never';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${min}m ${remSec}s`;
}

export const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; dot: string; border: string; chartColor: string; label: string }
> = {
  CRITICAL: {
    badge: 'bg-red-500/12 text-red-400 border-red-500/30 dark:text-red-400 text-red-600',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    chartColor: '#ef4444',
    label: 'Critical',
  },
  HIGH: {
    badge: 'bg-orange-500/12 text-orange-400 border-orange-500/30 dark:text-orange-400 text-orange-600',
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    chartColor: '#f97316',
    label: 'High',
  },
  MEDIUM: {
    badge: 'bg-amber-500/12 text-amber-400 border-amber-500/30 dark:text-amber-400 text-amber-600',
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    chartColor: '#eab308',
    label: 'Medium',
  },
  LOW: {
    badge: 'bg-sky-500/12 text-sky-400 border-sky-500/30 dark:text-sky-400 text-sky-600',
    dot: 'bg-sky-500',
    border: 'border-l-sky-500',
    chartColor: '#38bdf8',
    label: 'Low',
  },
  INFO: {
    badge: 'bg-zinc-500/12 text-zinc-400 border-zinc-500/30 dark:text-zinc-400 text-zinc-600',
    dot: 'bg-zinc-400',
    border: 'border-l-zinc-400',
    chartColor: '#71717a',
    label: 'Info',
  },
};

export const CATEGORY_META: Record<
  FindingCategory,
  { label: string; color: string; pill: string }
> = {
  security: {
    label: 'Security',
    color: '#ef4444',
    pill: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  },
  bug: {
    label: 'Bug',
    color: '#f97316',
    pill: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
  },
  performance: {
    label: 'Performance',
    color: '#8b5cf6',
    pill: 'bg-violet-500/10 text-violet-400 border-violet-500/25',
  },
  code_quality: {
    label: 'Code Quality',
    color: '#38bdf8',
    pill: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  },
};

export function getReviewStatusStyle(status: string): { label: string; className: string } {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
      };
    case 'awaiting_approval':
    case 'pending_approval':
      return {
        label: 'Awaiting Approval',
        className: 'bg-amber-500/10 text-amber-500 border-amber-500/25',
      };
    case 'in_progress':
    case 'analyzing':
    case 'fetching_context':
    case 'validating':
    case 'publishing':
      return {
        label: status === 'in_progress' ? 'Analyzing' : status.replace('_', ' '),
        className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
      };
    case 'queued':
      return {
        label: 'Queued',
        className: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'bg-red-500/10 text-red-400 border-red-500/25',
      };
    case 'skipped':
      return {
        label: 'Skipped',
        className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25',
      };
    default:
      return {
        label: 'Pending',
        className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25',
      };
  }
}
