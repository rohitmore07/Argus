'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-indigo-400/30 shadow-glow hover:bg-indigo-500/95 hover:-translate-y-[0.5px]',
        secondary:
          'bg-surface-elevated text-foreground border border-border hover:border-border-strong hover:bg-surface-hover',
        outline:
          'border border-border bg-transparent hover:border-border-strong hover:bg-surface-hover/65 text-foreground',
        ghost:
          'hover:bg-surface-hover/70 text-muted-foreground hover:text-foreground border border-transparent',
        destructive:
          'bg-destructive/90 text-destructive-foreground border border-red-400/25 hover:bg-destructive',
      },
      size: {
        default: 'h-9 px-3.5 py-2 text-[13px]',
        sm: 'h-8 rounded-md px-2.5 text-xs',
        lg: 'h-10 rounded-lg px-5 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
