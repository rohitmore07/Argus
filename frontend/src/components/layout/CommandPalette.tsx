'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  FolderGit2,
  GitPullRequest,
  Github,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { EASE_OUT_EXPO } from '@/components/motion/variants';
import { cn } from '@/lib/utils';

interface CommandAction {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const actions = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: 'nav-overview',
        label: 'Go to Overview',
        section: 'Navigation',
        shortcut: 'G O',
        icon: <LayoutDashboard className="h-3.5 w-3.5" />,
        run: () => router.push('/'),
      },
      {
        id: 'nav-repos',
        label: 'Go to Repositories',
        section: 'Navigation',
        shortcut: 'G R',
        icon: <FolderGit2 className="h-3.5 w-3.5" />,
        run: () => router.push('/repositories'),
      },
      {
        id: 'nav-prs',
        label: 'Go to Pull Requests',
        section: 'Navigation',
        shortcut: 'G P',
        icon: <GitPullRequest className="h-3.5 w-3.5" />,
        run: () => router.push('/pull-requests'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        section: 'Navigation',
        shortcut: 'G S',
        icon: <Settings className="h-3.5 w-3.5" />,
        run: () => router.push('/settings'),
      },
      {
        id: 'toggle-theme',
        label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        section: 'Preferences',
        icon: theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />,
        run: () => toggleTheme(),
      },
    ];

    if (user) {
      base.push({
        id: 'sign-out',
        label: `Sign out (@${user.githubUsername})`,
        section: 'Account',
        icon: <LogOut className="h-3.5 w-3.5" />,
        run: () => void logout(),
      });
    } else {
      base.push({
        id: 'connect-github',
        label: 'Connect GitHub OAuth',
        section: 'Account',
        icon: <Github className="h-3.5 w-3.5" />,
        run: () => {
          window.location.href = '/api/auth/github';
        },
      });
    }

    return base;
  }, [router, theme, toggleTheme, user, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.section.toLowerCase().includes(q)
    );
  }, [actions, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (!open) return;
      if (e.key === 'Escape') {
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (filtered.length > 0 ? (i + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) =>
          filtered.length > 0 ? (i - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        filtered[selectedIdx].run();
        onOpenChange(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, filtered, selectedIdx]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border-strong panel-elevated shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to workspace view or action..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No matching commands
                </div>
              ) : (
                filtered.map((action, idx) => {
                  const active = idx === selectedIdx;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => {
                        action.run();
                        onOpenChange(false);
                        setQuery('');
                      }}
                      className={cn(
                        'relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-colors',
                        active
                          ? 'bg-surface-hover text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={cn(active ? 'text-indigo-400' : 'text-muted-foreground')}>
                          {action.icon}
                        </span>
                        <span className="font-medium">{action.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/70">
                          {action.section}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {action.shortcut && (
                          <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {action.shortcut}
                          </kbd>
                        )}
                        {active && <ArrowRight className="h-3 w-3 text-indigo-400" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
