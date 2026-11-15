import {
  AgentFindingInput,
  FindingCategory,
  ReviewSettings,
  ReviewSummaryData,
  SEVERITY_ORDER,
  Severity,
} from '../../types';
import { LLMProvider } from '../../integrations/llm/llmProvider';
import { runStaticAnalysis } from '../../integrations/static-analysis/staticAnalyzer';
import {
  chunkFileDiffs,
  matchesIgnorePattern,
  ParsedFileDiff,
  validateFindingLineRange,
} from '../../utils/diffParser';
import { computeFingerprint } from '../../utils/crypto';
import { redactSecrets } from '../../utils/secretRedactor';
import { logger } from '../../utils/logger';
import { PRAnalysisContext } from '../baseAgent';
import { BugDetectionAgent } from '../bug-detection/bugDetectionAgent';
import { SecurityAnalysisAgent } from '../security-analysis/securityAnalysisAgent';
import { PerformanceAnalysisAgent } from '../performance-analysis/performanceAnalysisAgent';
import { CodeQualityAgent } from '../code-quality/codeQualityAgent';

export interface ValidatedFinding extends AgentFindingInput {
  fingerprint: string;
}

export interface OrchestratorResult {
  findings: ValidatedFinding[];
  rejectedCount: number;
  deduplicatedCount: number;
  summary: ReviewSummaryData;
  counts: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  filesAnalyzed: number;
  tokensUsed: number;
  model: string;
  provider: string;
}

const CATEGORY_PRIORITY: Record<FindingCategory, number> = {
  security: 4,
  bug: 3,
  performance: 2,
  code_quality: 1,
};

const MIN_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Computes token Jaccard similarity between two finding titles/descriptions
 * to identify semantically duplicate findings across multiple specialist agents.
 */
function tokenSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Formats an individual validated finding into a clean GitHub inline review comment.
 */
export function formatInlineCommentMarkdown(finding: {
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  suggestedFix?: string;
  confidenceScore: number;
  cwe?: string;
  owasp?: string;
  fingerprint: string;
}): string {
  const categoryLabel: Record<FindingCategory, string> = {
    bug: 'Bug Detection',
    security: 'Security Analysis',
    performance: 'Performance',
    code_quality: 'Code Quality',
  };

  const badges = [
    `**[${finding.severity}] ${redactSecrets(finding.title)}**`,
    `<sub>Category: \`${categoryLabel[finding.category]}\` | Confidence: ${Math.round(finding.confidenceScore * 100)}%${finding.cwe ? ` | ${finding.cwe}` : ''}${finding.owasp ? ` | ${finding.owasp}` : ''}</sub>`,
  ];

  const sections = [
    badges.join('\n'),
    '',
    '**Problem:**',
    redactSecrets(finding.description),
    '',
    '**Impact:**',
    redactSecrets(finding.impact),
    '',
    '**Recommendation:**',
    redactSecrets(finding.recommendation),
  ];

  if (finding.suggestedFix && finding.suggestedFix.trim().length > 0) {
    sections.push('', '**Suggested Fix:**', '```', redactSecrets(finding.suggestedFix.trim()), '```');
  }

  // Hidden fingerprint marker allows deterministic duplicate comment detection on GitHub PRs
  sections.push('', `<!-- pr-sentinel:fingerprint=${finding.fingerprint} -->`);

  return sections.join('\n');
}

/**
 * Builds the overall structured Markdown summary posted on the GitHub Pull Request.
 */
export function buildSummaryMarkdown(params: {
  prNumber: number;
  prTitle: string;
  headSha: string;
  overallStatusLabel: string;
  counts: OrchestratorResult['counts'];
  summary: Omit<ReviewSummaryData, 'markdown'>;
  findings: Array<{
    severity: Severity;
    category: FindingCategory;
    title: string;
    filePath: string;
    startLine: number;
  }>;
}): string {
  const { counts, summary, findings, headSha, overallStatusLabel } = params;
  const shortSha = headSha.slice(0, 7);

  const lines: string[] = [
    `## PR Sentinel — Automated Code Review Summary`,
    '',
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **Overall Status** | ${overallStatusLabel} |`,
    `| **Reviewed Commit** | \`${shortSha}\` |`,
    `| **Total Findings** | **${counts.total}** |`,
    `| **Critical** | ${counts.critical} |`,
    `| **High** | ${counts.high} |`,
    `| **Medium** | ${counts.medium} |`,
    `| **Low** | ${counts.low} |`,
    `| **Info** | ${counts.info} |`,
    '',
    '### Overview',
    redactSecrets(summary.overview),
    '',
    '### Security Analysis Summary',
    redactSecrets(summary.securitySummary),
    '',
    '### Bug Analysis Summary',
    redactSecrets(summary.bugSummary),
    '',
    '### Performance Analysis Summary',
    redactSecrets(summary.performanceSummary),
  ];

  if (summary.codeQualitySummary) {
    lines.push('', '### Code Quality Summary', redactSecrets(summary.codeQualitySummary));
  }

  if (findings.length > 0) {
    lines.push('', '### Findings Overview', '| Severity | Category | File | Issue |', '| :--- | :--- | :--- | :--- |');
    for (const f of findings.slice(0, 20)) {
      lines.push(
        `| **${f.severity}** | \`${f.category}\` | \`${f.filePath}:${f.startLine}\` | ${redactSecrets(f.title).replace(/\|/g, '\\|')} |`
      );
    }
    if (findings.length > 20) {
      lines.push('', `_...and ${findings.length - 20} additional findings recorded in the PR Sentinel dashboard._`);
    }
  }

  if (summary.recommendedNextSteps.length > 0) {
    lines.push('', '### Recommended Next Steps');
    for (const step of summary.recommendedNextSteps) {
      lines.push(`- ${redactSecrets(step)}`);
    }
  }

  lines.push(
    '',
    '---',
    `<sub>Generated by **PR Sentinel** Multi-Agent Review Engine for commit \`${shortSha}\`. PR Sentinel never auto-approves or auto-merges pull requests.</sub>`
  );

  return lines.join('\n');
}

export class ReviewOrchestrator {
  private readonly bugAgent = new BugDetectionAgent();
  private readonly securityAgent = new SecurityAnalysisAgent();
  private readonly performanceAgent = new PerformanceAnalysisAgent();
  private readonly codeQualityAgent = new CodeQualityAgent();

  /**
   * Validates, redacts, filters, deduplicates, and resolves conflicts across raw agent & static findings.
   * Exposed as a public deterministic method so it can be unit-tested thoroughly.
   */
  public validateAndMergeFindings(
    rawFindings: AgentFindingInput[],
    fileMap: Map<string, ParsedFileDiff>,
    settings: ReviewSettings
  ): {
    validated: ValidatedFinding[];
    rejectedCount: number;
    deduplicatedCount: number;
  } {
    const minSeverityRank = SEVERITY_ORDER[settings.minSeverity] ?? SEVERITY_ORDER.LOW;
    const enabledCategorySet = new Set<FindingCategory>(settings.enabledCategories);

    let rejectedCount = 0;
    const grounded: ValidatedFinding[] = [];

    for (const raw of rawFindings) {
      // 1. Verify category is enabled
      if (!enabledCategorySet.has(raw.category)) {
        rejectedCount += 1;
        continue;
      }

      // 2. Enforce minimum confidence threshold (static analysis has high intrinsic confidence)
      if (raw.agentSource !== 'static-analysis' && raw.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
        rejectedCount += 1;
        continue;
      }

      // 3. Enforce severity threshold
      if (SEVERITY_ORDER[raw.severity] < minSeverityRank) {
        rejectedCount += 1;
        continue;
      }

      // 4. Verify filePath exists in actual PR changed files
      const normalizedPath = raw.filePath.trim().replace(/^\.?\//, '');
      const parsedFile = fileMap.get(normalizedPath);
      if (!parsedFile || parsedFile.status === 'removed') {
        rejectedCount += 1;
        continue;
      }

      // 5. Strictly validate line numbers against changed lines in diff (NEVER comment on unchanged lines)
      const lineCheck = validateFindingLineRange(
        parsedFile,
        raw.startLine,
        raw.endLine,
        raw.codeSnippet
      );
      if (!lineCheck.valid) {
        rejectedCount += 1;
        continue;
      }

      // 6. Redact any sensitive values & enforce non-empty substantive descriptions
      const title = redactSecrets(raw.title || '').trim();
      const description = redactSecrets(raw.description || '').trim();
      const impact = redactSecrets(raw.impact || '').trim();
      const recommendation = redactSecrets(raw.recommendation || '').trim();
      if (!title || !description || !recommendation) {
        rejectedCount += 1;
        continue;
      }

      const fallbackSnippet =
        parsedFile.lineContentMap.get(lineCheck.startLine)?.trim() || '';
      const codeSnippet = redactSecrets((raw.codeSnippet || fallbackSnippet).trim());
      const suggestedFix = raw.suggestedFix ? redactSecrets(raw.suggestedFix.trim()) : '';

      const fingerprint = computeFingerprint([
        normalizedPath,
        lineCheck.startLine,
        raw.category,
        title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60),
      ]);

      grounded.push({
        ...raw,
        filePath: normalizedPath,
        startLine: lineCheck.startLine,
        endLine: lineCheck.endLine,
        title,
        description,
        impact: impact || 'May degrade application reliability, security, or maintainability.',
        recommendation,
        codeSnippet,
        suggestedFix,
        fingerprint,
      });
    }

    // 7. Sort by priority: Severity DESC -> Category Priority (Security > Bug > Perf > Quality) -> Confidence DESC
    grounded.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (sevDiff !== 0) return sevDiff;
      const catDiff = CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
      if (catDiff !== 0) return catDiff;
      return b.confidenceScore - a.confidenceScore;
    });

    // 8. Deduplicate overlapping & contradictory findings on the same file + nearby lines
    const deduped: ValidatedFinding[] = [];
    let deduplicatedCount = 0;

    for (const candidate of grounded) {
      const duplicate = deduped.find((existing) => {
        if (existing.filePath !== candidate.filePath) return false;
        if (existing.fingerprint === candidate.fingerprint) return true;

        const linesClose =
          Math.abs(existing.startLine - candidate.startLine) <= 2 ||
          (candidate.startLine >= existing.startLine && candidate.startLine <= existing.endLine);
        if (!linesClose) return false;

        // Same line & same category is almost always duplicate or contradictory advice; keep higher-priority one
        if (existing.startLine === candidate.startLine && existing.category === candidate.category) {
          return true;
        }

        // Cross-agent semantic overlap (e.g., static analyzer + security agent flagging same secret/SQLi)
        const sim = tokenSimilarity(
          `${existing.title} ${existing.description}`,
          `${candidate.title} ${candidate.description}`
        );
        return sim >= 0.35;
      });

      if (duplicate) {
        deduplicatedCount += 1;
        // Enrich kept finding with a suggestedFix if the kept one lacked one and duplicate had one
        if (!duplicate.suggestedFix && candidate.suggestedFix) {
          duplicate.suggestedFix = candidate.suggestedFix;
        }
        continue;
      }

      deduped.push(candidate);
    }

    return {
      validated: deduped,
      rejectedCount,
      deduplicatedCount,
    };
  }

  private buildCategorySummary(
    category: FindingCategory,
    findings: ValidatedFinding[],
    enabled: boolean
  ): string {
    if (!enabled) return 'Analysis disabled in repository review settings.';
    const items = findings.filter((f) => f.category === category);
    if (items.length === 0) {
      const labels: Record<FindingCategory, string> = {
        security: 'No security vulnerabilities detected in the analyzed diff.',
        bug: 'No functional bugs or runtime crash risks detected in the analyzed diff.',
        performance: 'No significant performance bottlenecks identified in the analyzed diff.',
        code_quality: 'No material code quality or maintainability issues flagged.',
      };
      return labels[category];
    }

    const topItems = items
      .slice(0, 3)
      .map((f) => `[${f.severity}] ${f.title} (${f.filePath}:${f.startLine})`)
      .join('; ');
    return `Detected ${items.length} issue(s): ${topItems}${items.length > 3 ? `, plus ${items.length - 3} more.` : '.'}`;
  }

  /**
   * Executes the full multi-agent + static analysis orchestration pipeline for a Pull Request.
   */
  public async runReview(params: {
    provider: LLMProvider;
    repoFullName: string;
    prNumber: number;
    prTitle: string;
    prDescription: string;
    sourceBranch: string;
    targetBranch: string;
    headSha: string;
    commitMessages: string[];
    parsedFiles: ParsedFileDiff[];
    settings: ReviewSettings;
    model?: string;
    temperature?: number;
  }): Promise<OrchestratorResult> {
    const { settings, provider } = params;

    // Filter ignored paths & binary/empty files
    const eligibleFiles = params.parsedFiles.filter(
      (f) =>
        f.status !== 'removed' &&
        f.changedLines.size > 0 &&
        !matchesIgnorePattern(f.filename, settings.ignoredPaths || [])
    );

    const fileMap = new Map<string, ParsedFileDiff>();
    for (const f of eligibleFiles) {
      fileMap.set(f.filename, f);
    }

    // Determine enabled specialist agents
    const activeAgents = [];
    const enabledSet = new Set<FindingCategory>(settings.enabledCategories);
    if (settings.enableBugDetection && enabledSet.has('bug')) activeAgents.push(this.bugAgent);
    if (settings.enableSecurityAnalysis && enabledSet.has('security')) activeAgents.push(this.securityAgent);
    if (settings.enablePerformanceAnalysis && enabledSet.has('performance')) {
      activeAgents.push(this.performanceAgent);
    }
    if (settings.enableCodeQualityAnalysis && enabledSet.has('code_quality')) {
      activeAgents.push(this.codeQualityAgent);
    }

    // Step 6: Run deterministic static & security analysis (secret scanning, dangerous sinks, OSV deps)
    const staticFindings = settings.enableSecurityAnalysis
      ? await runStaticAnalysis(eligibleFiles)
      : [];

    // Step 5: Chunk large PRs and dispatch to specialized AI agents
    const batches = chunkFileDiffs(eligibleFiles, settings.maxFilesPerBatch || 8, 32000);
    const rawAgentFindings: AgentFindingInput[] = [...staticFindings];

    let totalTokensUsed = 0;
    let modelUsed = params.model || provider.defaultModel;
    const providerUsed = provider.name;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      logger.info('Orchestrator dispatching diff batch to specialized agents', {
        repo: params.repoFullName,
        prNumber: params.prNumber,
        batchIndex: batchIdx + 1,
        totalBatches: batches.length,
        filesInBatch: batch.length,
        agents: activeAgents.map((a) => a.agentSource),
      });

      const context: PRAnalysisContext = {
        repoFullName: params.repoFullName,
        prNumber: params.prNumber,
        prTitle: params.prTitle,
        prDescription: params.prDescription,
        sourceBranch: params.sourceBranch,
        targetBranch: params.targetBranch,
        commitMessages: params.commitMessages,
        files: batch,
      };

      // Run enabled agents in parallel for this batch
      const settled = await Promise.allSettled(
        activeAgents.map((agent) =>
          agent.analyze(provider, context, {
            model: params.model,
            temperature: params.temperature,
          })
        )
      );

      let batchFailures = 0;
      let lastFailureMsg = '';
      for (const res of settled) {
        if (res.status === 'fulfilled') {
          rawAgentFindings.push(...res.value.findings);
          totalTokensUsed += res.value.tokensUsed;
          modelUsed = res.value.model;
        } else {
          batchFailures += 1;
          lastFailureMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
          logger.error('Specialist agent failed on batch', {
            batchIndex: batchIdx + 1,
            error: lastFailureMsg,
          });
        }
      }

      // If ALL active AI agents failed on a batch, fail fast rather than silently producing a fake clean review
      if (activeAgents.length > 0 && batchFailures === activeAgents.length) {
        throw new Error(`All AI review agents failed: ${lastFailureMsg}`);
      }
    }

    // Steps 7 & 8: Grounding validation, line verification, secret redaction, deduplication
    const { validated, rejectedCount, deduplicatedCount } = this.validateAndMergeFindings(
      rawAgentFindings,
      fileMap,
      settings
    );

    const counts = {
      total: validated.length,
      critical: validated.filter((f) => f.severity === 'CRITICAL').length,
      high: validated.filter((f) => f.severity === 'HIGH').length,
      medium: validated.filter((f) => f.severity === 'MEDIUM').length,
      low: validated.filter((f) => f.severity === 'LOW').length,
      info: validated.filter((f) => f.severity === 'INFO').length,
    };

    const overallStatusLabel =
      counts.critical > 0 || counts.high > 0
        ? settings.reviewMode === 'request_changes'
          ? 'Changes Requested (Critical/High Severity Findings)'
          : 'Attention Required (Critical/High Severity Findings)'
        : counts.total > 0
          ? 'Reviewed with Recommendations'
          : 'No Blocking Issues Found';

    const recommendedNextSteps: string[] = [];
    if (counts.critical > 0) {
      recommendedNextSteps.push(
        `Resolve all ${counts.critical} CRITICAL finding(s) immediately before merging.`
      );
    }
    if (counts.high > 0) {
      recommendedNextSteps.push(
        `Address the ${counts.high} HIGH severity issue(s) and add regression tests covering the affected paths.`
      );
    }
    if (counts.medium > 0) {
      recommendedNextSteps.push(
        `Review the ${counts.medium} MEDIUM severity finding(s) for reliability and performance improvements.`
      );
    }
    if (counts.total === 0) {
      recommendedNextSteps.push(
        'No automated blockers were detected across analyzed diffs. Proceed with standard peer review and CI checks.'
      );
    } else {
      recommendedNextSteps.push(
        'Re-push fixes to this branch to trigger an incremental PR Sentinel verification review.'
      );
    }

    const overview =
      counts.total === 0
        ? `PR Sentinel analyzed ${eligibleFiles.length} changed file(s) across ${activeAgents.length} specialist AI agent(s) and deterministic static checks. No issues meeting the configured minimum severity (${settings.minSeverity}) were detected.`
        : `PR Sentinel analyzed ${eligibleFiles.length} changed file(s) and identified ${counts.total} validated finding(s) (${counts.critical} Critical, ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low, ${counts.info} Info).`;

    const summaryBase: Omit<ReviewSummaryData, 'markdown'> = {
      overview,
      securitySummary: this.buildCategorySummary(
        'security',
        validated,
        settings.enableSecurityAnalysis && enabledSet.has('security')
      ),
      bugSummary: this.buildCategorySummary(
        'bug',
        validated,
        settings.enableBugDetection && enabledSet.has('bug')
      ),
      performanceSummary: this.buildCategorySummary(
        'performance',
        validated,
        settings.enablePerformanceAnalysis && enabledSet.has('performance')
      ),
      codeQualitySummary: this.buildCategorySummary(
        'code_quality',
        validated,
        settings.enableCodeQualityAnalysis && enabledSet.has('code_quality')
      ),
      recommendedNextSteps,
    };

    const markdown = buildSummaryMarkdown({
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      headSha: params.headSha,
      overallStatusLabel,
      counts,
      summary: summaryBase,
      findings: validated,
    });

    return {
      findings: validated,
      rejectedCount,
      deduplicatedCount,
      summary: { ...summaryBase, markdown },
      counts,
      filesAnalyzed: eligibleFiles.length,
      tokensUsed: totalTokensUsed,
      model: modelUsed,
      provider: providerUsed,
    };
  }
}

export const reviewOrchestrator = new ReviewOrchestrator();
