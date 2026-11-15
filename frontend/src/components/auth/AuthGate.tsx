'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bug,
  Check,
  Copy,
  Cpu,
  Database,
  Gauge,
  Github,
  Layers,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Webhook,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedStatusIndicator,
  HoverCard,
  StaggerContainer,
  StaggerItem,
} from '@/components/motion';
import { EASE_OUT_EXPO, SPRING_SNAPPY } from '@/components/motion/variants';

type AgentKey = 'security' | 'bugs' | 'performance' | 'quality' | 'orchestrator';

const PIPELINE_AGENTS: Array<{
  key: AgentKey;
  title: string;
  shortLabel: string;
  role: string;
  icon: typeof ShieldAlert;
  accent: string;
  accentBg: string;
  checks: string[];
  guarantee: string;
}> = [
  {
    key: 'security',
    title: 'Security Analysis Agent',
    shortLabel: 'Security',
    role: 'Principal AppSec Auditor · OWASP Top 10',
    icon: ShieldAlert,
    accent: 'text-rose-400',
    accentBg: 'bg-rose-500/12 border-rose-500/25',
    checks: [
      'SQL / NoSQL Injection ($where, template interpolation)',
      'IDOR, broken authorization & privilege escalation',
      'XSS, CSRF, SSRF & OS command injection sinks',
      'Hardcoded secrets redacted before LLM prompts or logs',
    ],
    guarantee: 'Paired with deterministic static scanner & live OSV.dev npm CVE lookup',
  },
  {
    key: 'bugs',
    title: 'Bug Detection Agent',
    shortLabel: 'Bugs',
    role: 'Staff Reliability & Correctness Engineer',
    icon: Bug,
    accent: 'text-orange-400',
    accentBg: 'bg-orange-500/12 border-orange-500/25',
    checks: [
      'Null / undefined dereferences & missing edge cases',
      'Race conditions, async/await errors & floating promises',
      'Resource & memory leaks across listeners and streams',
      'Context-aware inspection of surrounding source code',
    ],
    guarantee: 'Reads surrounding file context at headSha before flagging any defect',
  },
  {
    key: 'performance',
    title: 'Performance Agent',
    shortLabel: 'Perf',
    role: 'Principal Systems & Latency Engineer',
    icon: Gauge,
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/12 border-violet-500/25',
    checks: [
      'N+1 MongoDB / API queries inside async loops',
      'Unbounded queries missing pagination or projection',
      'O(n²) hot-path algorithms & blocking event-loop calls',
      'Avoidable React re-renders & memory spikes',
    ],
    guarantee: 'Strict evidence threshold — never emits speculative micro-optimizations',
  },
  {
    key: 'quality',
    title: 'Code Quality Agent',
    shortLabel: 'Quality',
    role: 'Staff Software Architect',
    icon: Sparkles,
    accent: 'text-sky-400',
    accentBg: 'bg-sky-500/12 border-sky-500/25',
    checks: [
      'Swallowed exceptions & inconsistent error boundaries',
      'High cyclomatic complexity & risky duplication',
      'Dead code, unused variables & broken abstractions',
      'Zero stylistic bike-shedding or formatting noise',
    ],
    guarantee: 'Focuses strictly on maintainability & production clarity',
  },
  {
    key: 'orchestrator',
    title: 'Review Orchestrator',
    shortLabel: 'Orchestrator',
    role: 'Grounding, Deduplication & GitHub Publisher',
    icon: Cpu,
    accent: 'text-indigo-400',
    accentBg: 'bg-indigo-500/12 border-indigo-500/25',
    checks: [
      'Validates every filePath & exact changed line against parsed diff hunks',
      'Deduplicates cross-agent overlap & resolves conflicts by priority',
      'Enforces nonce-fenced prompt-injection isolation for untrusted code',
      'Publishes COMMENT or REQUEST_CHANGES — never auto-approves or merges',
    ],
    guarantee: 'Zero hallucinated line numbers · Idempotent webhook & comment tracking',
  },
];

function CopyChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle/80 px-3 py-2">
      <div className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <code className="block truncate font-mono text-[11px] text-foreground/90">{value}</code>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2 font-mono text-[10px] text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, health, loading } = useAuth();
  const [activeAgentKey, setActiveAgentKey] = useState<AgentKey>('security');

  if (loading) {
    return (
      <div className="space-y-6 py-2">
        <Skeleton className="h-44 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const oauthReady = Boolean(
    health?.services.githubOAuth.configured && health?.services.mongodb.connected
  );
  const activeAgent =
    PIPELINE_AGENTS.find((a) => a.key === activeAgentKey) || PIPELINE_AGENTS[0];
  const ActiveIcon = activeAgent.icon;

  const services = [
    {
      name: 'MongoDB Atlas',
      sub: health?.services.mongodb.connected ? 'Mongoose Connected' : 'Set MONGODB_URI',
      ok: Boolean(health?.services.mongodb.connected),
      icon: Database,
    },
    {
      name: 'Redis + BullMQ',
      sub: health?.services.redis.connected ? 'Worker Active' : 'Set REDIS_URL',
      ok: Boolean(health?.services.redis.connected),
      icon: Layers,
    },
    {
      name: 'GitHub OAuth',
      sub: health?.services.githubOAuth.configured ? 'OAuth App Ready' : 'Set Client ID/Secret',
      ok: Boolean(health?.services.githubOAuth.configured),
      icon: Github,
    },
    {
      name: 'Google Gemini',
      sub: health?.services.ai.configured
        ? health.services.ai.model
        : 'Set GEMINI_API_KEY',
      ok: Boolean(health?.services.ai.configured),
      icon: Cpu,
    },
  ];

  return (
    <StaggerContainer className="mx-auto max-w-6xl space-y-8 py-2">
      {/* Editorial Atmospheric Hero Stage */}
      <StaggerItem>
        <section className="relative overflow-hidden rounded-2xl border border-border panel-elevated">
          {/* Animated architectural micro-grid & subtle beam */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-sentinel-grid opacity-80 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,#000_25%,transparent_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[540px] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl"
          />
          {/* Subtle animated scanline beam along top edge */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-400/80 to-transparent animate-scanline" />
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-8 p-6 md:p-9 lg:grid-cols-12 lg:items-center">
            {/* Left Editorial Column */}
            <div className="space-y-5 lg:col-span-6">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/90 px-3 py-1">
                <AnimatedStatusIndicator
                  status={oauthReady ? 'active' : 'analyzing'}
                  size="xs"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/85">
                  PR Sentinel · Multi-Agent Code Review Engine
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl leading-[1.1]">
                  Senior security &amp; systems review on every Pull Request.
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
                  Connect your GitHub repositories to monitor Pull Requests through HMAC-verified
                  webhooks. Four specialist Google Gemini agents and a deterministic static analyzer
                  validate findings strictly against changed lines before posting inline comments on
                  GitHub.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  size="lg"
                  disabled={!oauthReady}
                  asChild={oauthReady}
                  className="px-5"
                >
                  {oauthReady ? (
                    <a href="/api/auth/github">
                      <Github className="h-4 w-4" />
                      Continue with GitHub
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      Continue with GitHub
                    </>
                  )}
                </Button>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle/80 px-3 py-2 text-[11px] text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>AES-256-GCM tokens · Never auto-merges</span>
                </div>
              </div>

              {!oauthReady && (
                <p className="font-mono text-[11px] text-amber-400/90 leading-relaxed">
                  Awaiting environment config: set <span className="text-foreground">MONGODB_URI</span> &amp;{' '}
                  <span className="text-foreground">GITHUB_CLIENT_ID / SECRET</span> in{' '}
                  <span className="text-foreground">backend/.env</span> to unlock GitHub OAuth sign-in.
                </p>
              )}
            </div>

            {/* Right Interactive Multi-Agent Pipeline Explorer */}
            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-xl border border-border-strong/80 bg-[#08080c] shadow-2xl">
                {/* Pipeline Top Bar */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    </span>
                    <span className="ml-1 font-mono text-[11px] text-zinc-400">
                      review-orchestrator.pipeline
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-indigo-400">
                    {health?.services.ai.model || 'gemini-2.5-flash'}
                  </span>
                </div>

                {/* Interactive Agent Selector Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-white/[0.015] p-1.5">
                  {PIPELINE_AGENTS.map((agent) => {
                    const active = agent.key === activeAgentKey;
                    const Icon = agent.icon;
                    return (
                      <button
                        key={agent.key}
                        type="button"
                        onClick={() => setActiveAgentKey(agent.key)}
                        className={cn(
                          'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                          active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="gateway-agent-pill"
                            transition={SPRING_SNAPPY}
                            className="absolute inset-0 rounded-md border border-white/10 bg-white/[0.07]"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-1.5">
                          <Icon className={cn('h-3.5 w-3.5', active && agent.accent)} />
                          {agent.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Animated Active Agent Detail Surface */}
                <div className="min-h-[250px] p-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeAgent.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                      className="space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                              activeAgent.accentBg,
                              activeAgent.accent
                            )}
                          >
                            <ActiveIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold text-zinc-100">
                              {activeAgent.title}
                            </h2>
                            <p className="font-mono text-[11px] text-zinc-400">
                              {activeAgent.role}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {activeAgent.checks.map((check, idx) => (
                          <motion.div
                            key={check}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              delay: idx * 0.045,
                              duration: 0.22,
                              ease: EASE_OUT_EXPO,
                            }}
                            className="flex items-start gap-2.5 rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-xs text-zinc-300"
                          >
                            <ShieldCheck className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', activeAgent.accent)} />
                            <span>{check}</span>
                          </motion.div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-zinc-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>{activeAgent.guarantee}</span>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </section>
      </StaggerItem>

      {/* Live Infrastructure Readiness Strip (Real data from GET /api/health) */}
      <StaggerItem>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Live Backend Infrastructure Readiness
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time telemetry from <code className="font-mono text-[11px]">GET /api/health</code>. All
                analytics come strictly from MongoDB Atlas — never mocked.
              </p>
            </div>
            <AnimatedStatusIndicator
              status={health?.status === 'ready' ? 'active' : 'warning'}
              label={health?.status === 'ready' ? 'ALL SYSTEMS OPERATIONAL' : 'CONFIGURATION PENDING'}
              size="xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((svc) => {
              const Icon = svc.icon;
              return (
                <HoverCard key={svc.name} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted-foreground group-hover:text-foreground transition-colors">
                      <Icon className="h-4 w-4" />
                    </div>
                    <AnimatedStatusIndicator status={svc.ok ? 'active' : 'idle'} size="xs" />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-foreground">{svc.name}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {svc.sub}
                    </p>
                  </div>
                </HoverCard>
              );
            })}
          </div>

          {health && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 pt-1">
              <CopyChip
                label="GitHub OAuth Callback URL"
                value={health.services.githubOAuth.callbackUrl}
              />
              <CopyChip
                label="GitHub Webhook Endpoint (HMAC-SHA256)"
                value={health.services.githubWebhook.endpoint}
              />
            </div>
          )}
        </div>
      </StaggerItem>

      {/* Architectural Guarantees Footer Strip */}
      <StaggerItem>
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-6 md:grid-cols-3 text-xs">
          <div className="flex items-start gap-3">
            <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
            <div>
              <p className="font-medium text-foreground">Idempotent Webhook Ingestion</p>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                Timing-safe HMAC-SHA256 verification and delivery deduplication prevent duplicate
                reviews on identical commit SHAs.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="font-medium text-foreground">MongoDB Atlas + BullMQ Workers</p>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                Chunked multi-file analysis runs asynchronously with exponential retries and real
                Mongoose aggregation pipelines.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <p className="font-medium text-foreground">Untrusted Code Isolation</p>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                Prompt-injection XML nonce fencing, automatic credential redaction, and strict
                diff-hunk line validation.
              </p>
            </div>
          </div>
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
