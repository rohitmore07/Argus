'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  accordionVariants,
  EASE_OUT_EXPO,
  pageVariants,
  SPRING_SNAPPY,
  staggerContainerVariants,
  staggerItemVariants,
} from './variants';

/**
 * 1. PageTransition — Smooth route-level entrance transition with subtle vertical travel.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * 2. StaggerContainer — Orchestrates sequential entrance for lists and dashboard sections.
 */
export function StaggerContainer({
  children,
  className,
  viewportOnce = false,
  staggerDelay = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  viewportOnce?: boolean;
  staggerDelay?: number;
}) {
  const variants = {
    hidden: staggerContainerVariants.hidden,
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.03,
      },
    },
  };

  if (viewportOnce) {
    return (
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * 3. StaggerItem — Individual child participating in StaggerContainer orchestration.
 */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * 4. AnimatedCounter — Smooth spring-driven count-up triggered when entering the viewport.
 */
export function AnimatedCounter({
  value,
  className,
  suffix = '',
  prefix = '',
}: {
  value: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const prefersReduced = useReducedMotion();

  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, {
    stiffness: 95,
    damping: 22,
    mass: 0.7,
  });

  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    if (inView) {
      motionVal.set(value);
    }
  }, [inView, value, motionVal, prefersReduced]);

  useEffect(() => {
    if (prefersReduced) return;
    const unsubscribe = springVal.on('change', (latest) => {
      setDisplay(Math.round(latest));
    });
    return unsubscribe;
  }, [springVal, prefersReduced]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * 5. AnimatedTabs — Linear/Vercel sliding active indicator tab bar powered by `layoutId`.
 */
export interface AnimatedTabOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function AnimatedTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  layoutId = 'animated-tabs-pill',
  variant = 'pill',
  className,
}: {
  tabs: Array<AnimatedTabOption<T>>;
  activeId: T;
  onChange: (id: T) => void;
  layoutId?: string;
  variant?: 'pill' | 'underline';
  className?: string;
}) {
  if (variant === 'underline') {
    return (
      <div
        role="tablist"
        className={cn('flex items-center gap-1 border-b border-border overflow-x-auto', className)}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-400'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  transition={SPRING_SNAPPY}
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-indigo-400"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-subtle p-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-md border border-border-strong/80 bg-surface-elevated shadow-sm"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 6. MotionButton — Tactile interactive button with subtle hover lift and crisp press compression.
 */
export interface MotionButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, children, ...props }, ref) => {
    const variantStyles: Record<NonNullable<MotionButtonProps['variant']>, string> = {
      primary:
        'bg-primary text-primary-foreground border border-indigo-400/30 shadow-glow hover:bg-indigo-500/95',
      secondary:
        'bg-surface-elevated text-foreground border border-border hover:border-border-strong hover:bg-surface-hover',
      outline:
        'bg-transparent text-foreground border border-border hover:border-border-strong hover:bg-surface-hover/70',
      ghost:
        'bg-transparent text-muted-foreground hover:text-foreground hover:bg-surface-hover/70 border border-transparent',
      destructive:
        'bg-destructive/90 text-destructive-foreground border border-red-400/30 hover:bg-destructive',
    };

    const sizeStyles: Record<NonNullable<MotionButtonProps['size']>, string> = {
      sm: 'h-8 px-2.5 text-xs rounded-md',
      md: 'h-9 px-3.5 text-xs font-medium rounded-md',
      lg: 'h-10 px-5 text-sm font-medium rounded-lg',
      icon: 'h-8 w-8 rounded-md p-0',
    };

    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -0.5 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
MotionButton.displayName = 'MotionButton';

/**
 * 7. AnimatedPresencePanel — Smoothly animates height & opacity for collapsible sections and accordions.
 */
export function AnimatedPresencePanel({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          variants={accordionVariants}
          initial="collapsed"
          animate="expanded"
          exit="collapsed"
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 8. HoverCard — Layered obsidian surface with subtle cursor-tracking radial spotlight.
 */
export function HoverCard({
  children,
  className,
  spotlightColor,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  onClick?: () => void;
}) {
  const mouseX = useMotionValue(-300);
  const mouseY = useMotionValue(-300);
  const prefersReduced = useReducedMotion();

  const background = useMotionTemplate`radial-gradient(280px circle at ${mouseX}px ${mouseY}px, ${
    spotlightColor || 'var(--spotlight-color)'
  }, transparent 75%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const handleMouseLeave = () => {
    mouseX.set(-300);
    mouseY.set(-300);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      whileHover={prefersReduced ? undefined : { y: -1 }}
      transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border panel-surface transition-colors hover:border-border-strong',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

/**
 * 9. AnimatedStatusIndicator — Pulsing telemetry dot / ring with semantic states.
 */
export function AnimatedStatusIndicator({
  status,
  label,
  size = 'sm',
  className,
}: {
  status: 'active' | 'analyzing' | 'warning' | 'critical' | 'idle';
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const prefersReduced = useReducedMotion();

  const toneMap = {
    active: { dot: 'bg-emerald-400', ring: 'bg-emerald-400/50', text: 'text-emerald-400' },
    analyzing: { dot: 'bg-indigo-400', ring: 'bg-indigo-400/50', text: 'text-indigo-400' },
    warning: { dot: 'bg-amber-400', ring: 'bg-amber-400/50', text: 'text-amber-400' },
    critical: { dot: 'bg-red-500', ring: 'bg-red-500/50', text: 'text-red-400' },
    idle: { dot: 'bg-zinc-500', ring: 'bg-zinc-500/30', text: 'text-muted-foreground' },
  }[status];

  const dotSize = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
  }[size];

  const shouldPulse = !prefersReduced && status !== 'idle';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('relative inline-flex shrink-0 items-center justify-center', dotSize)}>
        {shouldPulse && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', toneMap.ring)}
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{
              duration: status === 'analyzing' ? 1.3 : 2.1,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}
        <span className={cn('relative rounded-full', dotSize, toneMap.dot)} />
      </span>
      {label && (
        <span className={cn('font-mono text-[11px] font-medium tracking-tight', toneMap.text)}>
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * 10. AnimatedTooltip — Refined fade-in tooltip for icon buttons and collapsed sidebar items.
 */
export function AnimatedTooltip({
  content,
  side = 'right',
  children,
  disabled = false,
}: {
  content: string;
  side?: 'top' | 'bottom' | 'right' | 'left';
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) return <>{children}</>;

  const posClasses = {
    right: 'left-full top-1/2 -translate-y-1/2 ml-2.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2.5',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  }[side];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12, ease: EASE_OUT_EXPO }}
            className={cn(
              'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border-strong bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-foreground shadow-xl',
              posClasses
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
