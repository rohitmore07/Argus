import React from 'react';
import { FindingCategory, Severity } from '@/types';
import { CATEGORY_META, cn, SEVERITY_STYLES } from '@/lib/utils';

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
        style.badge,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {severity}
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: {
  category: FindingCategory;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        meta.pill,
        className
      )}
    >
      {meta.label}
    </span>
  );
}
