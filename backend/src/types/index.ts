export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export const SEVERITY_LIST: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export type FindingCategory = 'bug' | 'security' | 'performance' | 'code_quality';

export const CATEGORY_LIST: FindingCategory[] = [
  'bug',
  'security',
  'performance',
  'code_quality',
];

export type ReviewMode = 'comment_only' | 'request_changes' | 'manual';

export type UserRole = 'admin' | 'developer' | 'viewer';

export type PullRequestReviewStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'awaiting_approval'
  | 'failed'
  | 'skipped';

export type ReviewProcessingStatus =
  | 'queued'
  | 'fetching_context'
  | 'analyzing'
  | 'validating'
  | 'publishing'
  | 'awaiting_approval'
  | 'completed'
  | 'failed';

export type ReviewOverallStatus =
  | 'clean'
  | 'commented'
  | 'changes_requested'
  | 'pending_approval'
  | 'failed';

export type FindingStatus = 'open' | 'published' | 'dismissed' | 'resolved';

export type CommentPublishingStatus =
  | 'pending'
  | 'published'
  | 'failed'
  | 'skipped_duplicate';

export type AgentSource =
  | 'bug-detection'
  | 'security-analysis'
  | 'performance-analysis'
  | 'code-quality'
  | 'static-analysis';

export interface ReviewSettings {
  autoReview: boolean;
  enabledCategories: FindingCategory[];
  minSeverity: Severity;
  enableBugDetection: boolean;
  enableSecurityAnalysis: boolean;
  enablePerformanceAnalysis: boolean;
  enableCodeQualityAnalysis: boolean;
  reviewMode: ReviewMode;
  requireManualApproval: boolean;
  maxFilesPerBatch: number;
  ignoredPaths: string[];
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  autoReview: true,
  enabledCategories: ['bug', 'security', 'performance', 'code_quality'],
  minSeverity: 'LOW',
  enableBugDetection: true,
  enableSecurityAnalysis: true,
  enablePerformanceAnalysis: true,
  enableCodeQualityAnalysis: true,
  reviewMode: 'comment_only',
  requireManualApproval: false,
  maxFilesPerBatch: 8,
  ignoredPaths: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.min.js',
    '*.min.css',
    'dist/**',
    'build/**',
  ],
};

export interface NotificationPreferences {
  inAppEnabled: boolean;
  notifyOnCompletion: boolean;
  notifyOnCriticalOnly: boolean;
  notifyOnFailure: boolean;
  webhookUrl: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inAppEnabled: true,
  notifyOnCompletion: true,
  notifyOnCriticalOnly: false,
  notifyOnFailure: true,
  webhookUrl: '',
};

export interface AIPreferences {
  provider: 'gemini';
  model: string;
  temperature: number;
}

export const DEFAULT_AI_PREFERENCES: AIPreferences = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.1,
};

export interface ChangedFileRecord {
  filename: string;
  previousFilename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl?: string;
}

export interface AgentFindingInput {
  title: string;
  severity: Severity;
  category: FindingCategory;
  description: string;
  impact: string;
  recommendation: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  suggestedFix?: string;
  confidenceScore: number;
  cwe?: string;
  owasp?: string;
  agentSource: AgentSource;
}

export interface ReviewSummaryData {
  overview: string;
  securitySummary: string;
  bugSummary: string;
  performanceSummary: string;
  codeQualitySummary: string;
  recommendedNextSteps: string[];
  markdown: string;
}

export interface ReviewJobPayload {
  pullRequestId: string;
  repositoryId: string;
  reviewId: string;
  userId: string;
  headSha: string;
  triggerSource: 'webhook' | 'manual';
  forceReReview?: boolean;
}
