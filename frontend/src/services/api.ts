import {
  ActivityLogRecord,
  AIPreferences,
  DashboardAnalytics,
  DashboardStats,
  FindingRecord,
  GitHubRepoOption,
  HealthStatus,
  NotificationPreferences,
  PullRequestRecord,
  RepositoryRecord,
  ReviewCommentRecord,
  ReviewMode,
  ReviewRecord,
  ReviewSettings,
  SettingsResponse,
  UserProfile,
} from '@/types';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code = 'API_ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const errObj =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error: { message?: string; code?: string; details?: unknown } }).error
        : null;
    throw new ApiError(
      errObj?.message || response.statusText || 'Request failed',
      response.status,
      errObj?.code || 'API_ERROR',
      errObj?.details
    );
  }

  return data as T;
}

export const api = {
  // System Health
  getHealth: () => apiRequest<HealthStatus>('/api/health'),

  // Auth
  getMe: () => apiRequest<{ user: UserProfile }>('/api/auth/me'),
  logout: () => apiRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  disconnectGitHub: () =>
    apiRequest<{ success: boolean; message: string }>('/api/auth/disconnect', { method: 'POST' }),

  // Dashboard
  getDashboardStats: () => apiRequest<DashboardStats>('/api/dashboard/stats'),
  getDashboardAnalytics: (days = 30) =>
    apiRequest<DashboardAnalytics>(`/api/dashboard/analytics?days=${days}`),
  getDashboardActivity: (page = 1, limit = 20) =>
    apiRequest<{
      items: ActivityLogRecord[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/dashboard/activity?page=${page}&limit=${limit}`),

  // Repositories
  getRepositories: () => apiRequest<{ repositories: RepositoryRecord[] }>('/api/repositories'),
  getGitHubRepositories: (page = 1) =>
    apiRequest<{ repositories: GitHubRepoOption[]; page: number; perPage: number }>(
      `/api/repositories/github?page=${page}&perPage=50`
    ),
  getRepositoryDetail: (id: string) =>
    apiRequest<{
      repository: RepositoryRecord;
      pullRequests: PullRequestRecord[];
      stats: {
        totalPRsReviewed: number;
        totalIssuesDetected: number;
        severityBreakdown: Record<string, number>;
        categoryBreakdown: Record<string, number>;
      };
    }>(`/api/repositories/${id}`),
  connectRepository: (payload: {
    owner: string;
    name: string;
    isMonitoringEnabled?: boolean;
    setupWebhook?: boolean;
    reviewSettings?: Partial<ReviewSettings>;
  }) =>
    apiRequest<{ repository: RepositoryRecord }>('/api/repositories/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRepositorySettings: (
    id: string,
    payload: {
      isMonitoringEnabled?: boolean;
      reviewSettings?: Partial<ReviewSettings>;
    }
  ) =>
    apiRequest<{ repository: RepositoryRecord }>(`/api/repositories/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  syncRepositoryPRs: (id: string) =>
    apiRequest<{ syncedCount: number }>(`/api/repositories/${id}/sync`, {
      method: 'POST',
    }),
  deleteRepository: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/repositories/${id}`, {
      method: 'DELETE',
    }),

  // Pull Requests
  getPullRequests: (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') {
        search.set(k, String(v));
      }
    });
    return apiRequest<{
      items: PullRequestRecord[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/pull-requests?${search.toString()}`);
  },
  getPullRequestDetail: (id: string) =>
    apiRequest<{ pullRequest: PullRequestRecord; reviews: ReviewRecord[] }>(
      `/api/pull-requests/${id}`
    ),
  triggerPullRequestReview: (id: string) =>
    apiRequest<{ jobId: string; reviewId: string; status: string }>(
      `/api/pull-requests/${id}/review`,
      { method: 'POST' }
    ),

  // Reviews & Findings
  getReviews: (page = 1, limit = 20) =>
    apiRequest<{
      items: ReviewRecord[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/reviews?page=${page}&limit=${limit}`),
  getReviewDetail: (id: string) =>
    apiRequest<{
      review: ReviewRecord;
      findings: FindingRecord[];
      comments: ReviewCommentRecord[];
    }>(`/api/reviews/${id}`),
  publishReview: (
    id: string,
    payload?: { reviewMode?: Exclude<ReviewMode, 'manual'>; findingIds?: string[] }
  ) =>
    apiRequest<{ githubReviewId: number; publishedCount: number; skippedDuplicates: number }>(
      `/api/reviews/${id}/publish`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }
    ),
  publishFinding: (id: string) =>
    apiRequest<{ status: string; comment: ReviewCommentRecord }>(`/api/findings/${id}/publish`, {
      method: 'POST',
    }),
  dismissFinding: (id: string, reason = '') =>
    apiRequest<{ finding: FindingRecord }>(`/api/findings/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Settings
  getSettings: () => apiRequest<SettingsResponse>('/api/settings'),
  updateSettings: (payload: {
    defaultReviewSettings?: Partial<ReviewSettings>;
    aiPreferences?: Partial<AIPreferences>;
    notificationPreferences?: Partial<NotificationPreferences>;
  }) =>
    apiRequest<{
      defaultReviewSettings: ReviewSettings;
      aiPreferences: AIPreferences;
      notificationPreferences: NotificationPreferences;
    }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
