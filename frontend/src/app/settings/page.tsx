'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  Database,
  Github,
  Layers,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import {
  AIPreferences,
  NotificationPreferences,
  ReviewMode,
  ReviewSettings,
  SettingsResponse,
  Severity,
} from '@/types';
import { AuthGate } from '@/components/auth/AuthGate';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedStatusIndicator, HoverCard } from '@/components/motion';

function CopyField({ label, value }: { label: string; value: string }) {
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2">
      <div className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <code className="block truncate font-mono text-[11px] text-foreground">{value}</code>
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

function SettingsContent() {
  const { health, refreshAuth } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [aiPrefs, setAiPrefs] = useState<AIPreferences | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [ignoreText, setIgnoreText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSettings();
      setData(res);
      setSettings(res.defaultReviewSettings);
      setAiPrefs(res.aiPreferences);
      setNotifPrefs(res.notificationPreferences);
      setIgnoreText((res.defaultReviewSettings.ignoredPaths || []).join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!settings || !aiPrefs || !notifPrefs) return;
    setSaving(true);
    try {
      const ignoredPaths = ignoreText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const enabledCategories: ReviewSettings['enabledCategories'] = [];
      if (settings.enableBugDetection) enabledCategories.push('bug');
      if (settings.enableSecurityAnalysis) enabledCategories.push('security');
      if (settings.enablePerformanceAnalysis) enabledCategories.push('performance');
      if (settings.enableCodeQualityAnalysis) enabledCategories.push('code_quality');

      const res = await api.updateSettings({
        defaultReviewSettings: { ...settings, enabledCategories, ignoredPaths },
        aiPreferences: aiPrefs,
        notificationPreferences: notifPrefs,
      });
      setSettings(res.defaultReviewSettings);
      setAiPrefs(res.aiPreferences);
      setNotifPrefs(res.notificationPreferences);
      await refreshAuth();
      toast({
        title: 'Global review defaults saved',
        description: 'Applied to newly connected repositories and AI runs.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to save settings',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !settings || !aiPrefs || !notifPrefs) {
    return (
      <ErrorState
        message={error || 'Unable to load settings'}
        onRetry={() => void loadSettings()}
      />
    );
  }

  const telemetry = [
    {
      name: 'MongoDB Atlas',
      value: health?.services.mongodb.connected ? 'Mongoose Connected' : 'Disconnected',
      ok: Boolean(health?.services.mongodb.connected),
      icon: Database,
    },
    {
      name: 'Redis + BullMQ',
      value: health?.services.redis.connected ? 'Worker Active' : 'Unavailable',
      ok: Boolean(health?.services.redis.connected),
      icon: Layers,
    },
    {
      name: 'Google Gemini',
      value: health?.services.ai.configured
        ? health.services.ai.model
        : 'Missing GEMINI_API_KEY',
      ok: Boolean(health?.services.ai.configured),
      icon: Cpu,
    },
    {
      name: 'GitHub OAuth',
      value: health?.services.githubOAuth.configured ? 'Configured' : 'Missing OAuth keys',
      ok: Boolean(health?.services.githubOAuth.configured),
      icon: Github,
    },
  ];

  const geminiModels = data?.infrastructure.availableGeminiModels || [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Workspace Configuration &amp; Engine Health
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure default multi-agent review policies, Google Gemini model selection, and inspect
          live backend telemetry.
        </p>
      </div>

      {/* Live Infrastructure Matrix */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] font-mono text-muted-foreground">
            Live Integration Status
          </h2>
          <AnimatedStatusIndicator
            status={health?.status === 'ready' ? 'active' : 'warning'}
            label={health?.status === 'ready' ? 'ALL SERVICES READY' : 'DEGRADED'}
            size="xs"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {telemetry.map((svc) => {
            const Icon = svc.icon;
            return (
              <HoverCard key={svc.name} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <AnimatedStatusIndicator status={svc.ok ? 'active' : 'idle'} size="xs" />
                </div>
                <p className="mt-3 text-xs font-semibold text-foreground">{svc.name}</p>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                  {svc.value}
                </p>
              </HoverCard>
            );
          })}
        </div>

        {health && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CopyField
              label="GitHub OAuth Callback URL"
              value={health.services.githubOAuth.callbackUrl}
            />
            <CopyField
              label="GitHub Webhook Endpoint"
              value={health.services.githubWebhook.endpoint}
            />
          </div>
        )}
      </section>

      {/* Default Review Policy & Gemini Engine Surface */}
      <section className="rounded-2xl border border-border panel-surface p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Default AI Review Engine Policy
            </h2>
            <p className="text-xs text-muted-foreground">
              Applied automatically to newly connected repositories. Override individually per
              repository at any time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
          <label className="space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Google Gemini Model
            </span>
            <select
              value={aiPrefs.model}
              onChange={(e) => setAiPrefs({ ...aiPrefs, model: e.target.value })}
              className="h-9 w-full rounded-md border border-border bg-surface-subtle px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {geminiModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Minimum Severity Threshold
            </span>
            <select
              value={settings.minSeverity}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minSeverity: e.target.value as Severity,
                })
              }
              className="h-9 w-full rounded-md border border-border bg-surface-subtle px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="INFO">INFO (All findings)</option>
              <option value="LOW">LOW and above</option>
              <option value="MEDIUM">MEDIUM and above</option>
              <option value="HIGH">HIGH and CRITICAL</option>
              <option value="CRITICAL">CRITICAL only</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              GitHub Review Mode
            </span>
            <select
              value={settings.reviewMode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  reviewMode: e.target.value as ReviewMode,
                })
              }
              className="h-9 w-full rounded-md border border-border bg-surface-subtle px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="comment_only">COMMENT (Inline comments)</option>
              <option value="request_changes">REQUEST_CHANGES on severe</option>
              <option value="manual">Manual review only</option>
            </select>
          </label>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-surface-subtle/60 p-4 text-xs">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Default Specialist Agents
          </p>
          {(
            [
              [
                'enableSecurityAnalysis',
                'Security Analysis (OWASP Top 10, Injection, Auth, Secrets, OSV CVE)',
              ],
              ['enableBugDetection', 'Bug Detection (Null safety, Race conditions, Error handling)'],
              [
                'enablePerformanceAnalysis',
                'Performance Analysis (N+1 queries, Complexity, Memory)',
              ],
              ['enableCodeQualityAnalysis', 'Code Quality & Maintainability'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-1">
              <span className="text-foreground/90">{label}</span>
              <Switch
                checked={settings[key]}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    [key]: checked,
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className="space-y-2.5 rounded-xl border border-border bg-surface-subtle/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="font-medium text-foreground">Require Dashboard Approval Before Publishing</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Inspect and filter findings before PR Sentinel posts inline comments to GitHub.
              </p>
            </div>
            <Switch
              checked={settings.requireManualApproval}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireManualApproval: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <div className="pr-4">
              <p className="font-medium text-foreground">Notify on Critical Findings Only</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Suppress lower-priority completion alerts when only informational notes are found.
              </p>
            </div>
            <Switch
              checked={notifPrefs.notifyOnCriticalOnly}
              onCheckedChange={(checked) =>
                setNotifPrefs({ ...notifPrefs, notifyOnCriticalOnly: checked })
              }
            />
          </div>
        </div>

        <label className="block space-y-1.5 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Default Ignored File Patterns (one glob per line)
          </span>
          <textarea
            rows={4}
            value={ignoreText}
            onChange={(e) => setIgnoreText(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-subtle p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Secret redaction, prompt-injection fencing &amp; no-auto-merge are permanently enforced.
          </span>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Global Policy'}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsContent />
    </AuthGate>
  );
}
