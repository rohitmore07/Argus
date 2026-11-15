'use client';

import React, { useState } from 'react';
import { ChevronDown, Cpu, Database, Github, Layers } from 'lucide-react';
import { HealthStatus } from '@/types';
import { cn } from '@/lib/utils';
import { AnimatedPresencePanel, AnimatedStatusIndicator } from '@/components/motion';

export function SystemStatusBanner({ health }: { health: HealthStatus | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!health || health.status === 'ready') return null;

  const items = [
    {
      label: 'MongoDB Atlas',
      ok: health.services.mongodb.connected,
      detail: health.services.mongodb.connected
        ? 'Connected via Mongoose'
        : health.services.mongodb.error || 'Set MONGODB_URI',
      icon: Database,
    },
    {
      label: 'Redis & BullMQ',
      ok: health.services.redis.connected,
      detail: health.services.redis.connected ? 'Worker Online' : 'Set REDIS_URL',
      icon: Layers,
    },
    {
      label: 'GitHub OAuth',
      ok: health.services.githubOAuth.configured,
      detail: health.services.githubOAuth.configured ? 'Configured' : 'Set Client ID/Secret',
      icon: Github,
    },
    {
      label: 'Google Gemini',
      ok: health.services.ai.configured,
      detail: health.services.ai.configured ? health.services.ai.model : 'Set GEMINI_API_KEY',
      icon: Cpu,
    },
  ];

  const readyCount = items.filter((i) => i.ok).length;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/[0.035] panel-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-amber-500/[0.04] transition-colors"
      >
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <AnimatedStatusIndicator status="warning" label={`${readyCount}/${items.length} SERVICES READY`} size="xs" />
          <span className="text-xs text-foreground/90 truncate">
            Configure environment variables in <code className="font-mono text-[11px] text-amber-300">backend/.env</code> to activate automated PR reviews.
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      <AnimatedPresencePanel open={expanded}>
        <div className="grid grid-cols-1 gap-2 border-t border-amber-500/15 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-border bg-surface/90 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>
                <AnimatedStatusIndicator status={item.ok ? 'active' : 'warning'} size="xs" />
              </div>
            );
          })}
        </div>
      </AnimatedPresencePanel>
    </div>
  );
}
