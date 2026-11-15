import { env } from '../../config/env';
import { ChangedFileRecord } from '../../types';
import { ExternalServiceError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  language: string | null;
  default_branch: string;
  html_url: string;
  private: boolean;
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
  };
  updated_at: string;
}

export interface GitHubPullRequestItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged_at: string | null;
  html_url: string;
  user: { login: string; avatar_url: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  changed_files?: number;
  additions?: number;
  deletions?: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubCommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

export interface GitHubReviewCommentPayload {
  path: string;
  line: number;
  side?: 'RIGHT';
  start_line?: number;
  start_side?: 'RIGHT';
  body: string;
}

export interface GitHubExistingComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  body: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real GitHub REST API v3 client with automatic rate-limit handling, retries, and typed responses.
 */
export class GitHubClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new ExternalServiceError('GitHub', 'Access token is required', 401);
    }
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      accept?: string;
      retries?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, accept = 'application/vnd.github+json', retries = 2 } = options;
    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.accessToken}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'User-Agent': 'PR-Sentinel/1.0',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // Handle GitHub primary & secondary rate limits gracefully
      const remaining = response.headers.get('x-ratelimit-remaining');
      const retryAfter = response.headers.get('retry-after');
      if ((response.status === 403 || response.status === 429) && attempt < retries) {
        if (remaining === '0' || retryAfter) {
          const waitSec = retryAfter ? Math.min(parseInt(retryAfter, 10) || 2, 15) : 2 * (attempt + 1);
          logger.warn('GitHub API rate limit encountered; backing off', {
            endpoint,
            status: response.status,
            waitSec,
          });
          await sleep(waitSec * 1000);
          continue;
        }
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        // non-JSON response (e.g. raw text)
      }

      if (!response.ok) {
        const message =
          typeof parsed === 'object' && parsed !== null && 'message' in parsed
            ? String((parsed as { message: unknown }).message)
            : text.slice(0, 250) || response.statusText;
        throw new ExternalServiceError('GitHub API', message, response.status, {
          endpoint,
          status: response.status,
        });
      }

      return parsed as T;
    }

    throw new ExternalServiceError('GitHub API', `Request failed after retries: ${endpoint}`, 502);
  }

  /**
   * Exchanges OAuth authorization code for a GitHub access token.
   */
  static async exchangeOAuthCode(code: string): Promise<{ accessToken: string; scope: string }> {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      throw new ExternalServiceError(
        'GitHub OAuth',
        'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not configured',
        503
      );
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'PR-Sentinel/1.0',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: env.GITHUB_CALLBACK_URL,
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || data.error || !data.access_token) {
      throw new ExternalServiceError(
        'GitHub OAuth',
        data.error_description || data.error || 'Failed to exchange OAuth code',
        401
      );
    }

    return {
      accessToken: data.access_token,
      scope: data.scope || '',
    };
  }

  async getAuthenticatedUser(): Promise<GitHubUserProfile> {
    const profile = await this.request<GitHubUserProfile>('/user');
    if (!profile.email) {
      try {
        const emails = await this.request<
          Array<{ email: string; primary: boolean; verified: boolean }>
        >('/user/emails');
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (primary) profile.email = primary.email;
      } catch {
        // user:email scope may not be granted; proceed cleanly without failing login
      }
    }
    return profile;
  }

  async listRepositories(page = 1, perPage = 50): Promise<GitHubRepoItem[]> {
    return this.request<GitHubRepoItem[]>(
      `/user/repos?sort=updated&direction=desc&affiliation=owner,collaborator,organization_member&per_page=${perPage}&page=${page}`
    );
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepoItem> {
    return this.request<GitHubRepoItem>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async createRepositoryWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string
  ): Promise<{ id: number }> {
    const hooks = await this.request<Array<{ id: number; config?: { url?: string } }>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`
    );

    const existing = hooks.find((h) => h.config?.url === webhookUrl);
    if (existing) {
      await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${existing.id}`,
        {
          method: 'PATCH',
          body: {
            active: true,
            events: ['pull_request'],
            config: {
              url: webhookUrl,
              content_type: 'json',
              secret,
              insecure_ssl: '0',
            },
          },
        }
      );
      return { id: existing.id };
    }

    return this.request<{ id: number }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
      {
        method: 'POST',
        body: {
          name: 'web',
          active: true,
          events: ['pull_request'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
            insecure_ssl: '0',
          },
        },
      }
    );
  }

  async deleteRepositoryWebhook(owner: string, repo: string, webhookId: number): Promise<void> {
    await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${webhookId}`,
      { method: 'DELETE' }
    );
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    perPage = 30
  ): Promise<GitHubPullRequestItem[]> {
    return this.request<GitHubPullRequestItem[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=${perPage}`
    );
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequestItem> {
    return this.request<GitHubPullRequestItem>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`
    );
  }

  async getPullRequestCommits(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubCommitItem[]> {
    return this.request<GitHubCommitItem[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/commits?per_page=100`
    );
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number,
    maxPages = 3
  ): Promise<ChangedFileRecord[]> {
    const allFiles: ChangedFileRecord[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<
        Array<{
          filename: string;
          previous_filename?: string;
          status: ChangedFileRecord['status'];
          additions: number;
          deletions: number;
          changes: number;
          patch?: string;
          blob_url?: string;
        }>
      >(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`
      );

      for (const f of batch) {
        allFiles.push({
          filename: f.filename,
          previousFilename: f.previous_filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          patch: f.patch || '',
          blobUrl: f.blob_url || '',
        });
      }

      if (batch.length < 100) break;
    }

    return allFiles;
  }

  async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string | null> {
    try {
      const encodedPath = filePath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      const data = await this.request<{ content?: string; encoding?: string; size?: number }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
      );
      if (data.size && data.size > 250_000) return null; // Skip huge files
      if (data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf8');
      }
      return null;
    } catch {
      return null;
    }
  }

  async listPullRequestReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubExistingComment[]> {
    return this.request<GitHubExistingComment[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments?per_page=100`
    );
  }

  /**
   * Publishes a GitHub Pull Request Review with summary body and optional inline comments.
   * STRICT SAFETY RULE: Never permits 'APPROVE' event.
   */
  async createPullRequestReview(
    owner: string,
    repo: string,
    prNumber: number,
    params: {
      commitId: string;
      body: string;
      event: 'COMMENT' | 'REQUEST_CHANGES';
      comments: GitHubReviewCommentPayload[];
    }
  ): Promise<{ id: number; html_url: string; state: string }> {
    const safeEvent: 'COMMENT' | 'REQUEST_CHANGES' =
      params.event === 'REQUEST_CHANGES' ? 'REQUEST_CHANGES' : 'COMMENT';

    return this.request<{ id: number; html_url: string; state: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`,
      {
        method: 'POST',
        body: {
          commit_id: params.commitId,
          body: params.body,
          event: safeEvent,
          comments: params.comments.map((c) => {
            const item: Record<string, unknown> = {
              path: c.path,
              line: c.line,
              side: 'RIGHT',
              body: c.body,
            };
            if (c.start_line && c.start_line < c.line) {
              item.start_line = c.start_line;
              item.start_side = 'RIGHT';
            }
            return item;
          }),
        },
      }
    );
  }

  /**
   * Publishes a single standalone inline comment on a changed line of a Pull Request.
   */
  async createSingleInlineComment(
    owner: string,
    repo: string,
    prNumber: number,
    params: {
      commitId: string;
      path: string;
      line: number;
      startLine?: number;
      body: string;
    }
  ): Promise<{ id: number; html_url: string }> {
    const payload: Record<string, unknown> = {
      commit_id: params.commitId,
      path: params.path,
      line: params.line,
      side: 'RIGHT',
      body: params.body,
    };
    if (params.startLine && params.startLine < params.line) {
      payload.start_line = params.startLine;
      payload.start_side = 'RIGHT';
    }

    return this.request<{ id: number; html_url: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }
}
