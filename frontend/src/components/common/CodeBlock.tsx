'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  label?: string;
  className?: string;
  showCopy?: boolean;
  startLineNumber?: number;
  tone?: 'default' | 'fix';
}

const TOKEN_REGEX =
  /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|async|await|return|if|else|for|while|switch|case|break|try|catch|finally|throw|new|import|export|from|default|type|interface|class|extends|implements|enum|readonly|public|private|protected|typeof|instanceof|in|of|void|true|false|null|undefined)\b|\b(?:Promise|Array|Record|Map|Set|Error|Request|Response|NextFunction|Buffer|string|number|boolean|unknown|any)\b|\b\d+(?:\.\d+)?\b)/gm;

export function highlightSyntaxLine(line: string): React.ReactNode {
  if (!line) return ' ';
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
    return <span className="text-zinc-500 italic">{line}</span>;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    let colorClass = 'text-zinc-200';
    if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('#')) {
      colorClass = 'text-zinc-500 italic';
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      colorClass = 'text-emerald-300';
    } else if (/^\d/.test(token)) {
      colorClass = 'text-amber-300';
    } else if (
      /^(Promise|Array|Record|Map|Set|Error|Request|Response|NextFunction|Buffer|string|number|boolean|unknown|any)$/.test(
        token
      )
    ) {
      colorClass = 'text-sky-300';
    } else {
      colorClass = 'text-indigo-400';
    }

    nodes.push(
      <span key={`${match.index}-${token}`} className={colorClass}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

export function CodeBlock({
  code,
  label,
  className,
  showCopy = true,
  startLineNumber,
  tone = 'default',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const lines = code.split('\n');

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-[#07070a]',
        tone === 'fix' ? 'border-emerald-500/25' : 'border-border',
        className
      )}
    >
      {(label || showCopy) && (
        <div
          className={cn(
            'flex items-center justify-between border-b px-3 py-1.5 text-[11px]',
            tone === 'fix'
              ? 'border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-300/90'
              : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
          )}
        >
          <span className="inline-flex items-center gap-1.5 font-mono truncate">
            <Terminal className="h-3 w-3 opacity-70 shrink-0" />
            {label || 'code'}
          </span>
          {showCopy && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100 transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="copied"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.14 }}
                    className="inline-flex items-center gap-1 text-emerald-400"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.14 }}
                    className="inline-flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-[12px] leading-5 font-mono text-zinc-200">
        {lines.map((line, i) => (
          <div key={i} className="flex whitespace-pre">
            {typeof startLineNumber === 'number' && (
              <span className="mr-4 w-8 select-none text-right text-[11px] text-zinc-600 tabular-nums">
                {startLineNumber + i}
              </span>
            )}
            <span className="flex-1">{highlightSyntaxLine(line)}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
