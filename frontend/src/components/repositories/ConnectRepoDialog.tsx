'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FolderGit2, Globe, Lock, Plus, RefreshCw, Search } from 'lucide-react';
import { api } from '@/services/api';
import { GitHubRepoOption } from '@/types';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export function ConnectRepoDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const [repos, setRepos] = useState<GitHubRepoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGitHubRepositories(1);
      setRepos(res.repositories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GitHub repositories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchRepos();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.language && r.language.toLowerCase().includes(q))
    );
  }, [repos, search]);

  const handleConnect = async (repo: GitHubRepoOption) => {
    setConnectingId(repo.id);
    try {
      const res = await api.connectRepository({
        owner: repo.owner.login,
        name: repo.name,
        isMonitoringEnabled: true,
        setupWebhook: true,
      });
      toast({
        title: `Connected ${repo.full_name}`,
        description:
          res.repository.webhookStatus === 'active'
            ? 'GitHub Pull Request webhook registered and active.'
            : 'Repository connected (configure public webhook URL for auto-triggers).',
        variant: 'success',
      });
      onConnected();
      await fetchRepos();
    } catch (err) {
      toast({
        title: 'Failed to connect repository',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'error',
      });
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-indigo-400" />
            Connect GitHub Repository
          </DialogTitle>
          <DialogDescription>
            Select a repository to register an HMAC-SHA256 webhook and begin automated Pull Request
            auditing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter repositories by name or language..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-surface-subtle border-border text-xs h-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchRepos()}
            disabled={loading}
            aria-label="Refresh GitHub repositories"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="mt-3 max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
          {loading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : error ? (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-4 font-mono text-xs text-red-400">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No matching GitHub repositories found.
            </p>
          ) : (
            filtered.map((repo) => (
              <motion.div
                key={repo.id}
                layout
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/75 px-3.5 py-2.5 hover:border-border-strong hover:bg-surface-hover/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-foreground">
                      {repo.full_name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {repo.private ? (
                        <Lock className="h-2.5 w-2.5" />
                      ) : (
                        <Globe className="h-2.5 w-2.5" />
                      )}
                      {repo.private ? 'Private' : 'Public'}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {repo.language || 'Unknown'} · branch {repo.default_branch}
                  </p>
                </div>

                {repo.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-400 shrink-0">
                    <Check className="h-3 w-3" />
                    Connected
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={connectingId === repo.id}
                    onClick={() => void handleConnect(repo)}
                    className="shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {connectingId === repo.id ? 'Connecting...' : 'Connect'}
                  </Button>
                )}
              </motion.div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
