'use client';

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '@/services/api';
import { RepositoryRecord, ReviewMode, ReviewSettings, Severity } from '@/types';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export function RepoSettingsDialog({
  repo,
  open,
  onOpenChange,
  onSaved,
}: {
  repo: RepositoryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [ignoreText, setIgnoreText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (repo) {
      setSettings(repo.reviewSettings);
      setIgnoreText((repo.reviewSettings.ignoredPaths || []).join('\n'));
    }
  }, [repo]);

  if (!repo || !settings) return null;

  const handleSave = async () => {
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

      await api.updateRepositorySettings(repo._id, {
        reviewSettings: {
          ...settings,
          enabledCategories,
          ignoredPaths,
        },
      });
      toast({
        title: 'Repository policy saved',
        description: `Updated review engine configuration for ${repo.fullName}.`,
        variant: 'success',
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to update settings',
        description: err instanceof Error ? err.message : 'Request failed',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
            Policy · {repo.fullName}
          </DialogTitle>
          <DialogDescription>
            Customize AI severity gates, specialist agents, comment publishing mode, and excluded
            file patterns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                className="h-9 w-full rounded-md border border-border bg-surface-subtle px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="h-9 w-full rounded-md border border-border bg-surface-subtle px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="comment_only">COMMENT (Inline comments)</option>
                <option value="request_changes">REQUEST_CHANGES on severe</option>
                <option value="manual">Manual review only</option>
              </select>
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-surface-subtle/60 p-3.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Active Specialist Agents
            </p>
            {(
              [
                ['enableSecurityAnalysis', 'Security Analysis (OWASP, Injection, Secrets, OSV CVE)'],
                ['enableBugDetection', 'Bug & Reliability Detection (Null safety, Race conditions)'],
                ['enablePerformanceAnalysis', 'Performance & Scalability (N+1 queries, Complexity)'],
                ['enableCodeQualityAnalysis', 'Code Quality & Architecture'],
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

          <div className="space-y-2 rounded-lg border border-border bg-surface-subtle/60 p-3.5">
            <div className="flex items-center justify-between py-0.5">
              <div>
                <p className="font-medium text-foreground">Automatic Webhook Reviews</p>
                <p className="text-[11px] text-muted-foreground">
                  Run AI analysis automatically on PR opened/synchronize events.
                </p>
              </div>
              <Switch
                checked={settings.autoReview}
                onCheckedChange={(checked) => setSettings({ ...settings, autoReview: checked })}
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <div>
                <p className="font-medium text-foreground">Require Manual Approval Before Posting</p>
                <p className="text-[11px] text-muted-foreground">
                  Inspect findings in PR Sentinel before publishing comments to GitHub.
                </p>
              </div>
              <Switch
                checked={settings.requireManualApproval}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, requireManualApproval: checked })
                }
              />
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Ignored File Patterns (one glob per line)
            </span>
            <textarea
              rows={3}
              value={ignoreText}
              onChange={(e) => setIgnoreText(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-subtle p-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={'*.lock\ndist/**\n*.min.js'}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save Policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
