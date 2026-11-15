'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Copy,
  FileCode2,
  GitCompare,
  Sparkles,
} from 'lucide-react';
import { ChangedFile, FindingRecord } from '@/types';
import { CATEGORY_META, cn, SEVERITY_STYLES } from '@/lib/utils';
import { highlightSyntaxLine } from '@/components/common/CodeBlock';
import { AnimatedPresencePanel } from '@/components/motion';

interface ParsedLine {
  type: 'hunk' | 'add' | 'remove' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parsePatch(patch?: string): ParsedLine[] {
  if (!patch) return [];
  const raw = patch.split('\n');
  const out: ParsedLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of raw) {
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      out.push({ type: 'hunk', content: line });
    } else if (line.startsWith('+')) {
      out.push({ type: 'add', content: line.slice(1), newLine });
      newLine += 1;
    } else if (line.startsWith('-')) {
      out.push({ type: 'remove', content: line.slice(1), oldLine });
      oldLine += 1;
    } else if (line.startsWith('\\')) {
      continue;
    } else {
      out.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLine,
        newLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }
  return out;
}

function InlineFixCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/20 transition-colors"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="ok"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="inline-flex items-center gap-1"
          >
            <Check className="h-2.5 w-2.5" />
            Copied
          </motion.span>
        ) : (
          <motion.span
            key="cp"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="inline-flex items-center gap-1"
          >
            <Copy className="h-2.5 w-2.5" />
            Copy Fix
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function DiffFileCard({
  file,
  findings,
  defaultOpen,
}: {
  file: ChangedFile;
  findings: FindingRecord[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showCompareFor, setShowCompareFor] = useState<Record<string, boolean>>({});
  const lines = useMemo(() => parsePatch(file.patch), [file.patch]);

  const findingsByLine = useMemo(() => {
    const map = new Map<number, FindingRecord[]>();
    for (const f of findings) {
      if (f.startLine) {
        const list = map.get(f.startLine) || [];
        list.push(f);
        map.set(f.startLine, list);
      }
    }
    return map;
  }, [findings]);

  const statusTone =
    file.status === 'added'
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : file.status === 'removed'
        ? 'text-red-400 border-red-500/30 bg-red-500/10'
        : 'text-sky-400 border-sky-500/30 bg-sky-500/10';

  return (
    <div
      id={`diff-file-${encodeURIComponent(file.filename)}`}
      className="overflow-hidden rounded-xl border border-border bg-[#07070b] shadow-panel"
    >
      {/* IDE File Header Bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200',
              !open && '-rotate-90'
            )}
          />
          <FileCode2 className="h-4 w-4 shrink-0 text-indigo-400" />
          <span className="truncate font-mono text-xs font-medium text-zinc-100">
            {file.filename}
          </span>
          <span
            className={cn(
              'hidden sm:inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider',
              statusTone
            )}
          >
            {file.status}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] tabular-nums">
          <span className="text-emerald-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
          {findings.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
              {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
            </span>
          )}
        </div>
      </button>

      {/* Animated Expandable Code Editor Patch View */}
      <AnimatedPresencePanel open={open}>
        {lines.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-xs text-zinc-500">
            Diff patch unavailable (binary asset or truncated by GitHub API).
          </div>
        ) : (
          <div className="overflow-x-auto font-mono text-[12px] leading-[1.45rem]">
            {lines.map((line, idx) => {
              const attached = line.newLine ? findingsByLine.get(line.newLine) : undefined;
              const isHunk = line.type === 'hunk';

              return (
                <React.Fragment key={idx}>
                  <div
                    className={cn(
                      'flex border-b border-white/[0.025]',
                      line.type === 'add' && 'bg-emerald-500/[0.08]',
                      line.type === 'remove' && 'bg-red-500/[0.08]',
                      isHunk && 'bg-indigo-500/[0.08] text-indigo-300/90'
                    )}
                  >
                    <span className="w-11 shrink-0 select-none border-r border-white/[0.05] px-2 text-right text-[11px] text-zinc-600 tabular-nums">
                      {line.oldLine ?? ''}
                    </span>
                    <span className="w-11 shrink-0 select-none border-r border-white/[0.05] px-2 text-right text-[11px] text-zinc-600 tabular-nums">
                      {line.newLine ?? ''}
                    </span>
                    <span
                      className={cn(
                        'w-6 shrink-0 select-none text-center font-semibold',
                        line.type === 'add' && 'text-emerald-400',
                        line.type === 'remove' && 'text-red-400',
                        line.type === 'context' && 'text-zinc-600'
                      )}
                    >
                      {line.type === 'add'
                        ? '+'
                        : line.type === 'remove'
                          ? '-'
                          : isHunk
                            ? '@@'
                            : ' '}
                    </span>
                    <span className="flex-1 whitespace-pre px-2 text-zinc-200">
                      {isHunk ? line.content : highlightSyntaxLine(line.content)}
                    </span>
                  </div>

                  {/* Inline Grounded Review Annotation */}
                  {attached &&
                    attached.map((finding) => {
                      const sev = SEVERITY_STYLES[finding.severity];
                      const cat = CATEGORY_META[finding.category];
                      const compareOpen = Boolean(showCompareFor[finding._id]);

                      return (
                        <div
                          key={finding._id}
                          className="border-y border-indigo-500/20 bg-[#0d0e16] px-4 py-3.5 font-sans"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                                  sev.badge
                                )}
                              >
                                {sev.label}
                              </span>
                              <span className="font-mono text-[10px] text-zinc-400">
                                {cat.label}
                              </span>
                              <span className="text-xs font-semibold text-zinc-100">
                                {finding.title}
                              </span>
                            </div>

                            {finding.suggestedFix && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowCompareFor((prev) => ({
                                      ...prev,
                                      [finding._id]: !prev[finding._id],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-white/[0.08] transition-colors"
                                >
                                  <GitCompare className="h-2.5 w-2.5 text-indigo-400" />
                                  {compareOpen ? 'Hide Compare' : 'Compare Fix'}
                                </button>
                                <InlineFixCopyButton code={finding.suggestedFix} />
                              </div>
                            )}
                          </div>

                          <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                            {finding.description}
                          </p>
                          <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-indigo-300/90 leading-relaxed">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{finding.recommendation}</span>
                          </p>

                          {/* Suggested Fix Comparison */}
                          {finding.suggestedFix && (
                            <div className="mt-3 overflow-hidden rounded-lg border border-emerald-500/20 bg-[#060609] font-mono text-[11.5px]">
                              {compareOpen && (
                                <div className="border-b border-white/[0.06] bg-red-500/[0.08] px-3 py-1.5 text-red-200/90 whitespace-pre-wrap">
                                  <span className="mr-2 select-none text-red-400">-</span>
                                  {line.content}
                                </div>
                              )}
                              <div className="bg-emerald-500/[0.06] px-3 py-2 text-emerald-200 whitespace-pre-wrap">
                                {finding.suggestedFix.split('\n').map((fixLine: string, i: number) => (
                                  <div key={i} className="flex">
                                    <span className="mr-2 select-none text-emerald-400">+</span>
                                    <span>{fixLine}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </AnimatedPresencePanel>
    </div>
  );
}

export function DiffViewer({
  files,
  findings,
  focusedFile,
}: {
  files: ChangedFile[];
  findings: FindingRecord[];
  focusedFile?: string | null;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border panel-surface p-10 text-center text-xs text-muted-foreground">
        No modified diff files available for this Pull Request.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file, idx) => {
        const fileFindings = findings.filter(
          (f) => f.filePath === file.filename && f.status !== 'dismissed'
        );
        const shouldOpen =
          focusedFile === file.filename || fileFindings.length > 0 || idx < 2;
        return (
          <DiffFileCard
            key={`${file.filename}-${focusedFile === file.filename ? 'focus' : 'std'}`}
            file={file}
            findings={fileFindings}
            defaultOpen={shouldOpen}
          />
        );
      })}
    </div>
  );
}
