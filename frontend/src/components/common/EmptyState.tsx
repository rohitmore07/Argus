'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT_EXPO } from '@/components/motion/variants';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  badge?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  badge,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border panel-surface px-6 py-14 text-center',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sentinel-dots opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,#000_20%,transparent_100%)]"
      />
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
        <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-strong bg-surface-elevated text-indigo-400 shadow-panel">
          <Icon className="h-5 w-5" />
          <span className="absolute -inset-1 rounded-2xl border border-indigo-500/15" />
        </div>
        {badge && (
          <span className="mb-2 inline-flex items-center rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </motion.div>
  );
}
