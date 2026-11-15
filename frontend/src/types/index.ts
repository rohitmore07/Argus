export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingCategory = 'bug' | 'security' | 'performance' | 'code_quality';
export type ReviewMode = 'comment_only' | 'request_changes' | 'manual';
export type FindingStatus = 'open' | 'published' | 'dismissed' | 'resolved';

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

export interface AIPreferences {
  provider: 'gemini';
  model: string;
  temperature: number;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  notifyOnCompletion: boolean;
  notifyOnCriticalOnly: boolean;
  notifyOnFailure: boolean;
  webhookUrl: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  githubId: string;
  githubUsername: string;
  githubConnected: boolean;
  avatarUrl: string;
  role: 'admin' | 'developer' | 'viewer';
  defaultReviewSettings: ReviewSettings;
  aiPreferences: AIPreferences;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
}

export interface HealthStatus {
  status: 'ready' | 'degraded';
  timestamp: string;
  services: {
    mongodb: { connected: boolean; configured: boolean; error: string | null };
    redis: { connected: boolean; configured: boolean; error: string | null };
    bullmq: {
      connected: boolean;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    githubOAuth: { configured: boolean; callbackUrl: string };
    githubApp: { configured: boolean };
    githubWebhook: {
      secretConfigured: boolean;
      publicUrlConfigured: boolean;
      endpoint: string;
    };
    ai: {
      provider: string;
      model: string;
      configured: boolean;
      providers: Array<{ name: string; defaultModel: string; configured: boolean }>;
    };
  };
}

export interface RepositoryRecord {
  _id: string;
  githubRepositoryId: number;
  name: string;
  fullName: string;
  owner: string;
  description: string;
  primaryLanguage: string;
  defaultBranch: string;
  htmlUrl: string;
  isPrivate: boolean;
  isMonitoringEnabled: boolean;
  webhookId: number | null;
  webhookStatus: 'active' | 'pending' | 'manual' | 'error';
  reviewSettings: ReviewSettings;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: {
    totalPRsReviewed: number;
    totalIssuesDetected: number;
    criticalIssues: number;
    highIssues: number;
    lastReviewDate: string | null;
  };
}

export interface GitHubRepoOption {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  language: string | null;
  default_branch: string;
  html_url: string;
  private: boolean;
  updated_at: string;
  connected: boolean;
  connectedRepoId: string | null;
}

export interface ChangedFile {
  filename: string;
  previousFilename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl?: string;
}

export interface PullRequestRecord {
  _id: string;
  repositoryId:
    | string
    | {
        _id: string;
        name: string;
        fullName: string;
        owner: string;
        primaryLanguage?: string;
        htmlUrl?: string;
      };
  githubPRId: number;
  prNumber: number;
  title: string;
  description: string;
  author: string;
  authorAvatarUrl: string;
  htmlUrl: string;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  baseSha: string;
  changedFiles?: ChangedFile[];
  changedFilesCount: number;
  additions: number;
  deletions: number;
  reviewStatus: PullRequestReviewStatus;
  lastReviewedSha: string | null;
  latestReviewId:
    | string
    | null
    | {
        _id: string;
        overallStatus: string;
        processingStatus: ReviewProcessingStatus;
        totalFindings: number;
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
        infoCount: number;
        completedAt: string | null;
        startedAt: string | null;
      };
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCommentRecord {
  _id: string;
  reviewId: string;
  findingId: string;
  githubCommentId: number | null;
  filePath: string;
  line: number;
  commentBody: string;
  publishingStatus: 'pending' | 'published' | 'failed' | 'skipped_duplicate';
  errorMessage: string | null;
  createdAt: string;
}

export interface FindingRecord {
  _id: string;
  reviewId: string;
  pullRequestId: string;
  repositoryId: string;
  agentSource: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  suggestedFix: string;
  confidenceScore: number;
  status: FindingStatus;
  fingerprint: string;
  cwe?: string;
  owasp?: string;
  dismissReason?: string;
  commentStatus?: ReviewCommentRecord | null;
  createdAt: string;
}

export interface ReviewRecord {
  _id: string;
  pullRequestId: PullRequestRecord | string;
  repositoryId: RepositoryRecord | string;
  headSha: string;
  triggerSource: 'webhook' | 'manual';
  reviewMode: ReviewMode;
  overallStatus: 'clean' | 'commented' | 'changes_requested' | 'pending_approval' | 'failed';
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  summary: {
    overview: string;
    securitySummary: string;
    bugSummary: string;
    performanceSummary: string;
    codeQualitySummary: string;
    recommendedNextSteps: string[];
    markdown: string;
  };
  processingStatus: ReviewProcessingStatus;
  errorMessage: string | null;
  githubReviewId: number | null;
  llmProvider: string;
  llmModel: string;
  tokensUsed: number;
  filesAnalyzed: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalConnectedRepositories: number;
  activeMonitoredRepositories: number;
  totalPullRequestsReviewed: number;
  totalPullRequestsTracked: number;
  totalIssuesDetected: number;
  totalBugsDetected: number;
  securityVulnerabilitiesDetected: number;
  performanceIssuesDetected: number;
  codeQualityIssuesDetected: number;
  criticalIssuesDetected: number;
  highSeverityIssues: number;
  mediumSeverityIssues: number;
  lowSeverityIssues: number;
  infoSeverityIssues: number;
  processingStats: {
    completed: number;
    awaitingApproval: number;
    inProgress: number;
    failed: number;
    avgDurationMs: number;
    queue: {
      connected: boolean;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  };
}

export interface DashboardAnalytics {
  rangeDays: number;
  issuesOverTime: Array<{
    date: string;
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;
  issuesBySeverity: Array<{ severity: Severity; count: number }>;
  issuesByCategory: Array<{ category: FindingCategory; label: string; count: number }>;
  repositoryActivity: Array<{
    repositoryId: string;
    repository: string;
    reviewsCount: number;
    findingsCount: number;
    criticalCount: number;
  }>;
}

export interface ActivityLogRecord {
  _id: string;
  eventType: string;
  description: string;
  repositoryId?: { _id: string; name: string; fullName: string } | null;
  pullRequestId?: { _id: string; prNumber: number; title: string; latestReviewId?: string } | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SettingsResponse {
  account: {
    name: string;
    email: string;
    githubUsername: string;
    githubConnected: boolean;
    avatarUrl: string;
    role: string;
  };
  defaultReviewSettings: ReviewSettings;
  aiPreferences: AIPreferences;
  notificationPreferences: NotificationPreferences;
  infrastructure: {
    providers: Array<{ name: string; defaultModel: string; configured: boolean }>;
    availableGeminiModels: string[];
    webhookEndpointUrl: string;
    githubOAuthConfigured: boolean;
    githubAppConfigured: boolean;
    geminiConfigured: boolean;
  };
}
