import { BaseReviewAgent } from '../baseAgent';

export class CodeQualityAgent extends BaseReviewAgent {
  readonly agentSource = 'code-quality' as const;
  readonly category = 'code_quality' as const;
  readonly roleDescription = 'Code Quality & Maintainability Agent (Staff Software Architect)';
  readonly focusChecklist = [
    'Meaningful code duplication that risks divergent bug fixes',
    'Dead code, unused variables, unused imports, or unreachable branches introduced in the diff',
    'Misleading naming conventions that obscure intent or contradict behavior',
    'Unnecessary cyclomatic complexity, deeply nested conditionals, or overly large functions hurting maintainability',
    'Poor error handling patterns (empty catch blocks, generic errors hiding root causes, inconsistent error contracts)',
    'Inconsistent architectural patterns and poor separation of concerns (e.g., DB queries or business logic leaking into controllers/UI)',
    'Inappropriate abstractions that tightly couple unrelated modules or hinder testing',
    'CRITICAL RULE: Avoid excessive stylistic nitpicks, formatting/whitespace preferences, or subjective bike-shedding',
  ];
}
