'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Command,
  FolderGit2,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AnimatedStatusIndicator,
  AnimatedTooltip,
  PageTransition,
} from '@/components/motion';
import { EASE_OUT_EXPO, SPRING_SNAPPY } from '@/components/motion/variants';
import { CommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, keyHint: '1' },
  { href: '/repositories', label: 'Repositories', icon: FolderGit2, keyHint: '2' },
  { href: '/pull-requests', label: 'Pull Requests', icon: GitPullRequest, keyHint: '3' },
  { href: '/settings', label: 'Settings', icon: Settings, keyHint: '4' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, health, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const allReady = health?.status === 'ready';
  const sidebarWidth = collapsed ? 68 : 244;

  const currentSection =
    pathname === '/'
      ? 'Overview'
      : pathname
          .split('/')
          .filter(Boolean)[0]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      {/* Subtle atmospheric canvas lighting + ultra-fine film noise */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 sentinel-ambient-bg z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-sentinel-noise opacity-[0.025] dark:opacity-[0.035] z-0"
      />

      {/* Desktop Collapsible Rail Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth }}
        transition={SPRING_SNAPPY}
        className="hidden md:flex md:flex-col md:fixed md:inset-y-0 z-30 border-r border-border bg-surface/95 backdrop-blur-xl"
      >
        {/* Brand Header */}
        <div
          className={cn(
            'flex h-14 items-center border-b border-border px-3.5',
            collapsed ? 'justify-center' : 'justify-between'
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-400/35 bg-indigo-500/15 text-indigo-400 shadow-[0_0_20px_-6px_rgba(99,102,241,0.75)]"
            >
              <ShieldCheck className="h-4 w-4" />
            </motion.div>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  className="min-w-0 leading-none"
                >
                  <span className="block truncate text-[13px] font-semibold tracking-tight text-foreground">
                    PR Sentinel
                  </span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Security · AI Review
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>

          {!collapsed && (
            <AnimatedTooltip content="Collapse rail" side="right">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </AnimatedTooltip>
          )}
        </div>

        {/* Navigation Links with sliding active indicator & gliding hover surface */}
        <nav
          className="flex-1 space-y-1 px-2.5 py-3.5"
          onMouseLeave={() => setHoveredHref(null)}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isHovered = hoveredHref === item.href;

            const linkEl = (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredHref(item.href)}
                className={cn(
                  'group relative flex items-center rounded-lg text-[13px] font-medium transition-colors',
                  collapsed ? 'h-10 w-10 justify-center mx-auto' : 'gap-2.5 px-2.5 py-2',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {/* Hover gliding pill */}
                {isHovered && !active && (
                  <motion.span
                    layoutId="sentinel-nav-hover"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-lg bg-surface-hover/80"
                  />
                )}

                {/* Active surface pill + luminous left accent bar */}
                {active && (
                  <>
                    <motion.span
                      layoutId="sentinel-nav-active"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg border border-border-strong/75 bg-surface-elevated shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    />
                    {!collapsed && (
                      <motion.span
                        layoutId="sentinel-nav-bar"
                        transition={SPRING_SNAPPY}
                        className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]"
                      />
                    )}
                  </>
                )}

                <motion.span
                  whileHover={{ scale: 1.08 }}
                  transition={{ duration: 0.14 }}
                  className={cn(
                    'relative z-10 flex shrink-0 items-center justify-center',
                    active ? 'text-indigo-400' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </motion.span>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ duration: 0.14 }}
                      className="relative z-10 flex-1 truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );

            return collapsed ? (
              <AnimatedTooltip key={item.href} content={item.label} side="right">
                {linkEl}
              </AnimatedTooltip>
            ) : (
              linkEl
            );
          })}

          {collapsed && (
            <div className="pt-2 flex justify-center">
              <AnimatedTooltip content="Expand rail" side="right">
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  aria-label="Expand sidebar"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                </button>
              </AnimatedTooltip>
            </div>
          )}
        </nav>

        {/* Bottom Telemetry & Account Dock */}
        <div className="border-t border-border p-2.5 space-y-2.5">
          {collapsed ? (
            <div className="flex justify-center py-1">
              <AnimatedTooltip
                content={allReady ? 'Engine Ready' : 'Setup required — click Settings'}
                side="right"
              >
                <Link
                  href="/settings"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-subtle hover:border-border-strong transition-colors"
                >
                  <AnimatedStatusIndicator status={allReady ? 'active' : 'warning'} size="sm" />
                </Link>
              </AnimatedTooltip>
            </div>
          ) : (
            <Link
              href="/settings"
              className="block rounded-lg border border-border bg-surface-subtle/90 p-2.5 hover:border-border-strong transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Engine Telemetry
                </span>
                <AnimatedStatusIndicator
                  status={allReady ? 'active' : 'warning'}
                  label={allReady ? 'READY' : 'SETUP'}
                  size="xs"
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[10px] text-muted-foreground">
                {[
                  { label: 'MongoDB', ok: health?.services.mongodb.connected },
                  { label: 'BullMQ', ok: health?.services.redis.connected },
                  { label: 'Gemini', ok: health?.services.ai.configured },
                  { label: 'GitHub', ok: health?.services.githubOAuth.configured },
                ].map((s) => (
                  <span key={s.label} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        s.ok ? 'bg-emerald-400' : 'bg-zinc-600'
                      )}
                    />
                    <span className={s.ok ? 'text-foreground/85' : ''}>{s.label}</span>
                  </span>
                ))}
              </div>
            </Link>
          )}

          {user && (
            <div
              className={cn(
                'flex items-center rounded-lg px-1.5 py-1',
                collapsed ? 'justify-center' : 'justify-between gap-2'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.githubUsername}
                    className="h-7 w-7 shrink-0 rounded-full border border-border-strong object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/15 text-[11px] font-semibold text-indigo-400">
                    {user.githubUsername.slice(0, 2).toUpperCase()}
                  </div>
                )}
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      @{user.githubUsername}
                    </p>
                  </div>
                )}
              </div>
              {!collapsed && (
                <AnimatedTooltip content="Sign out" side="top">
                  <button
                    type="button"
                    onClick={() => void logout()}
                    aria-label="Sign out"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </AnimatedTooltip>
              )}
            </div>
          )}
        </div>
      </motion.aside>

      {/* Mobile Animated Slide-Over Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={SPRING_SNAPPY}
              className="fixed inset-y-0 left-0 flex w-68 flex-col border-r border-border bg-surface p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-indigo-400/30 bg-indigo-500/15 text-indigo-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold">PR Sentinel</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="mt-3 flex-1 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-surface-elevated text-foreground border border-border'
                          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active && 'text-indigo-400')} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Fluid Stage */}
      <motion.div
        initial={false}
        animate={{ paddingLeft: 0 }}
        className={cn(
          'relative z-10 flex min-w-0 flex-1 flex-col transition-[margin] duration-200',
          collapsed ? 'md:ml-[68px]' : 'md:ml-[244px]'
        )}
      >
        {/* Minimal Command Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-background/75 px-4 md:px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-[11px] text-muted-foreground">sentinel</span>
              <span className="text-border-strong">/</span>
              <span className="font-medium tracking-tight text-foreground">{currentSection}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Raycast/Linear Command Palette Trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-2.5 rounded-lg border border-border bg-surface/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
            >
              <Command className="h-3 w-3" />
              <span>Quick jump...</span>
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>

            {/* Animated Theme Toggle */}
            <AnimatedTooltip
              content={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              side="bottom"
            >
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface/80 text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {theme === 'dark' ? (
                    <motion.span
                      key="sun"
                      initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                      transition={{ duration: 0.16 }}
                    >
                      <Sun className="h-3.5 w-3.5" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="moon"
                      initial={{ opacity: 0, rotate: 45, scale: 0.8 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: -45, scale: 0.8 }}
                      transition={{ duration: 0.16 }}
                    >
                      <Moon className="h-3.5 w-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </AnimatedTooltip>

            {!user && (
              <Button size="sm" asChild>
                <a href="/api/auth/github">Connect GitHub</a>
              </Button>
            )}
          </div>
        </header>

        {/* Page Content with smooth App Router transition */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-7 lg:px-9">
          <PageTransition key={pathname}>{children}</PageTransition>
        </main>
      </motion.div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
