import { ChangedFileRecord } from '../types';

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
  /** 1-based position within the unified diff patch (for GitHub legacy positioning if needed) */
  patchPosition: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedFileDiff {
  filename: string;
  status: ChangedFileRecord['status'];
  additions: number;
  deletions: number;
  patch: string;
  hunks: DiffHunk[];
  /** Exact right-side (new file) line numbers that were added or modified in the PR */
  changedLines: Set<number>;
  /** All right-side line numbers present in the diff hunks (added + context) */
  diffVisibleLines: Set<number>;
  /** Quick lookup from right-side line number -> code content */
  lineContentMap: Map<number, string>;
  /** Surrounding file context fetched from GitHub headSha (optional) */
  surroundingContext?: string;
}

const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const DEFAULT_SKIPPED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.zip',
  '.tar',
  '.gz',
  '.map',
];

/**
 * Matches a file path against simple glob patterns (e.g. `dist/**`, `*.min.js`, `package-lock.json`).
 */
export function matchesIgnorePattern(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/^\/+/, '');
  const lower = normalized.toLowerCase();

  if (DEFAULT_SKIPPED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return true;
  }

  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE_STAR___/g, '.*');
    const regex = new RegExp(`(^|/)${escaped}$`, 'i');
    if (regex.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Parses a GitHub unified diff patch into structured hunks and exact changed-line sets.
 */
export function parseFilePatch(file: ChangedFileRecord): ParsedFileDiff {
  const hunks: DiffHunk[] = [];
  const changedLines = new Set<number>();
  const diffVisibleLines = new Set<number>();
  const lineContentMap = new Map<number, string>();

  const patch = file.patch || '';
  if (!patch) {
    return {
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: '',
      hunks,
      changedLines,
      diffVisibleLines,
      lineContentMap,
    };
  }

  const rawLines = patch.split('\n');
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let patchPosition = 0;

  for (const rawLine of rawLines) {
    patchPosition += 1;
    const hunkMatch = rawLine.match(HUNK_HEADER_REGEX);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      newLine = parseInt(hunkMatch[3], 10);
      const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

      currentHunk = {
        header: rawLine,
        oldStart: oldLine,
        oldCount,
        newStart: newLine,
        newCount,
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;
    if (rawLine.startsWith('\\ No newline at end of file')) continue;

    if (rawLine.startsWith('+')) {
      const content = rawLine.slice(1);
      currentHunk.lines.push({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: newLine,
        content,
        patchPosition,
      });
      changedLines.add(newLine);
      diffVisibleLines.add(newLine);
      lineContentMap.set(newLine, content);
      newLine += 1;
    } else if (rawLine.startsWith('-')) {
      const content = rawLine.slice(1);
      currentHunk.lines.push({
        type: 'del',
        oldLineNumber: oldLine,
        newLineNumber: null,
        content,
        patchPosition,
      });
      oldLine += 1;
    } else {
      const content = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
      currentHunk.lines.push({
        type: 'context',
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        content,
        patchPosition,
      });
      diffVisibleLines.add(newLine);
      lineContentMap.set(newLine, content);
      oldLine += 1;
      newLine += 1;
    }
  }

  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch,
    hunks,
    changedLines,
    diffVisibleLines,
    lineContentMap,
  };
}

/**
 * Formats a parsed file diff with explicit line numbers so LLM agents always reference exact new-file line numbers.
 */
export function formatAnnotatedDiff(parsed: ParsedFileDiff): string {
  const out: string[] = [];
  out.push(`FILE: ${parsed.filename} (${parsed.status}, +${parsed.additions}/-${parsed.deletions})`);
  out.push(`CHANGED_LINE_NUMBERS: [${Array.from(parsed.changedLines).sort((a, b) => a - b).join(', ')}]`);

  for (const hunk of parsed.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      if (line.type === 'add') {
        out.push(`+ L${line.newLineNumber}: ${line.content}`);
      } else if (line.type === 'del') {
        out.push(`- (old L${line.oldLineNumber}): ${line.content}`);
      } else {
        out.push(`  L${line.newLineNumber}: ${line.content}`);
      }
    }
  }

  if (parsed.surroundingContext) {
    out.push('--- SURROUNDING FILE CONTEXT (READ-ONLY REFERENCE) ---');
    out.push(parsed.surroundingContext);
  }

  return out.join('\n');
}

/**
 * Extracts bounded surrounding context lines around changed hunks from the full file text.
 */
export function extractSurroundingContext(
  fullFileContent: string,
  parsed: ParsedFileDiff,
  contextPadding = 15,
  maxTotalLines = 180
): string {
  if (!fullFileContent || parsed.hunks.length === 0) return '';
  const allLines = fullFileContent.split('\n');
  const ranges: Array<[number, number]> = [];

  for (const hunk of parsed.hunks) {
    const start = Math.max(1, hunk.newStart - contextPadding);
    const end = Math.min(allLines.length, hunk.newStart + Math.max(hunk.newCount, 1) + contextPadding);
    if (ranges.length > 0 && start <= ranges[ranges.length - 1][1] + 3) {
      ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  const snippetLines: string[] = [];
  for (const [start, end] of ranges) {
    if (snippetLines.length >= maxTotalLines) break;
    snippetLines.push(`// Lines ${start}-${end}`);
    for (let ln = start; ln <= end && snippetLines.length < maxTotalLines; ln++) {
      snippetLines.push(`L${ln}: ${allLines[ln - 1] ?? ''}`);
    }
  }

  return snippetLines.join('\n');
}

/**
 * Splits parsed diffs into bounded chunks so large Pull Requests never overflow LLM context windows.
 */
export function chunkFileDiffs(
  files: ParsedFileDiff[],
  maxFilesPerBatch = 8,
  maxCharsPerBatch = 32000
): ParsedFileDiff[][] {
  const batches: ParsedFileDiff[][] = [];
  let currentBatch: ParsedFileDiff[] = [];
  let currentChars = 0;

  for (const file of files) {
    // Skip deleted files or files with zero changed right-side lines (cannot attach inline review comments)
    if (file.status === 'removed' || file.changedLines.size === 0) continue;

    const estimatedSize =
      file.patch.length + (file.surroundingContext ? file.surroundingContext.length : 0) + 250;

    if (
      currentBatch.length > 0 &&
      (currentBatch.length >= maxFilesPerBatch || currentChars + estimatedSize > maxCharsPerBatch)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(file);
    currentChars += estimatedSize;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Validates that a finding's reported line range maps to real changed lines in the diff.
 * Rejects hallucinated or unchanged line numbers.
 */
export function validateFindingLineRange(
  parsed: ParsedFileDiff,
  startLine: number,
  endLine: number,
  codeSnippet?: string
): { valid: boolean; startLine: number; endLine: number } {
  const safeStart = Math.max(1, Math.floor(startLine));
  const safeEnd = Math.max(safeStart, Math.floor(endLine || safeStart));

  // Direct match: startLine or any line in [startLine, endLine] is an actually changed line
  const matchedChangedLines: number[] = [];
  for (let ln = safeStart; ln <= safeEnd; ln++) {
    if (parsed.changedLines.has(ln)) {
      matchedChangedLines.push(ln);
    }
  }

  if (matchedChangedLines.length > 0) {
    return {
      valid: true,
      startLine: matchedChangedLines[0],
      endLine: matchedChangedLines[matchedChangedLines.length - 1],
    };
  }

  // Tight ±1 line offset tolerance ONLY if codeSnippet uniquely matches an adjacent changed line
  if (codeSnippet && codeSnippet.trim().length >= 6) {
    const snippetToken = codeSnippet.trim().split('\n')[0].trim();
    for (const delta of [-1, 1]) {
      const candidate = safeStart + delta;
      if (parsed.changedLines.has(candidate)) {
        const actualLine = parsed.lineContentMap.get(candidate) || '';
        if (actualLine.trim().includes(snippetToken.slice(0, 40))) {
          return { valid: true, startLine: candidate, endLine: candidate };
        }
      }
    }
  }

  return { valid: false, startLine: safeStart, endLine: safeEnd };
}
