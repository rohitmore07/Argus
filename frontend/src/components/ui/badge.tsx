import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-tight',
        variant === 'default' && 'border-primary/30 bg-primary/15 text-primary',
        variant === 'secondary' && 'border-border bg-secondary text-secondary-foreground',
        variant === 'outline' && 'border-border bg-transparent text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}
