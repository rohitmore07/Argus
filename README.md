# PR Sentinel — AI-Powered GitHub Pull Request Review Agent

**PR Sentinel** is a full-stack, production-oriented automated code review platform that connects to GitHub repositories via OAuth and verified webhooks, analyzes Pull Request diffs through a coordinated multi-agent Google Gemini AI engine + deterministic static security scanner, posts grounded inline review comments and structured summaries directly on GitHub Pull Requests, and persists all telemetry and findings in **MongoDB Atlas** using **Mongoose ODM**.

---

## Architecture Overview

```
GitHub PR Webhook (HMAC-SHA256)
        │
        ▼
Express.js REST API (backend/) ──► Idempotency check (WebhookDelivery) & MongoDB upsert
        │
        ▼
BullMQ Queue (Redis) ──► Review Worker (concurrency-controlled, exponential backoff)
        │
        ▼
GitHub REST API v3 ──► Fetch PR metadata, commits, changed files, patches & surrounding context
        │
        ▼
Review Orchestrator
  ├── Static & Dependency Analyzer (Secrets redaction, dangerous sinks, live OSV.dev npm CVEs)
  ├── Agent 1: Bug Detection Agent (Google Gemini Structured JSON)
  ├── Agent 2: Security Analysis Agent (OWASP Top 10, CWE, redacted secrets)
  ├── Agent 3: Performance Analysis Agent (N+1 queries, complexity, memory, pagination)
  └── Agent 4: Code Quality Agent (Maintainability, error handling, abstractions)
        │
        ▼
Strict Grounding & Deduplication Layer
  • Validates every filePath & exact line number against parsed unified diff changed lines
  • Rejects speculative findings & unchanged-line comments
  • Redacts any credential/secret before storage, logging, or GitHub publishing
  • Resolves cross-agent duplicates via location + semantic fingerprinting
        │
        ▼
GitHub Pull Request Reviews API (COMMENT / REQUEST_CHANGES — NEVER APPROVE / MERGE)
        │
        ▼
MongoDB Atlas (Mongoose) ──► Next.js App Router Dashboard (frontend/)
```

---

## Technology Stack

- **Frontend (`frontend/`)**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui (Radix primitives), Framer Motion, Recharts, Lucide React, interactive Unified/Split Diff Viewer.
- **Backend (`backend/`)**: Node.js, Express.js, TypeScript, REST API, GitHub REST API v3, GitHub Webhooks, GitHub App RS256 JWT support, Helmet, Zod validation, tiered rate limiting.
- **Database**: **MongoDB Atlas + Mongoose ODM** (8 collections with compound unique indexes, aggregation pipelines, and TTL log retention). Zero relational databases or Prisma.
- **AI Infrastructure**: Google Gemini API (`@google/genai`) with structured JSON schema outputs behind an extensible `LLMProvider` registry.
- **Background Queue**: Redis + BullMQ (`pr-sentinel-reviews` queue & worker).
- **Security**: AES-256-GCM encrypted GitHub OAuth tokens & per-repository webhook secrets, timing-safe HMAC-SHA256 webhook signature verification, nonce-fenced prompt-injection protection, secret redaction across prompts/logs/comments, SSRF-protected notification webhooks.

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 20+
- MongoDB Atlas cluster (or local MongoDB 7 via Docker Compose)
- Redis 7+ (Upstash, Redis Cloud, or local Redis via Docker Compose)
- GitHub OAuth App credentials
- Google Gemini API key

### 2. Configure Environment Variables

Copy the example templates and fill in your credentials:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Generate strong 64-character hex secrets for `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configure GitHub OAuth App

1. Open **GitHub Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL**: `http://localhost:3000` (or your production domain).
3. Set **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`.
4. Copy **Client ID** and **Client Secret** into `backend/.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### 4. Configure GitHub Webhooks (for Automatic PR Reviews)

- For local testing, expose port `4000` (or `3000`) via ngrok/Cloudflare Tunnel and set:
  ```env
  GITHUB_WEBHOOK_PUBLIC_URL=https://your-public-domain.example.com/api/webhooks/github
  GITHUB_WEBHOOK_SECRET=your-strong-webhook-secret
  ```
- When `GITHUB_WEBHOOK_PUBLIC_URL` is configured, connecting a repository in PR Sentinel automatically registers the repository webhook with `pull_request` events and an encrypted per-repository secret.
- You can also configure the webhook manually on GitHub (**Repository Settings → Webhooks**):
  - Payload URL: `https://<your-host>/api/webhooks/github`
  - Content type: `application/json`
  - Secret: matches `GITHUB_WEBHOOK_SECRET`
  - Events: **Pull requests**

### 5. Install & Run

```bash
# Install dependencies for both backend and frontend
npm run install:all

# Start Express backend (port 4000) and BullMQ worker
npm run dev:backend

# In a second terminal, start Next.js frontend (port 3000)
npm run dev:frontend
```

Or launch MongoDB, Redis, Backend, and Frontend together with Docker Compose:

```bash
docker compose up --build
```

---

## MongoDB Collections & Indexes

| Collection | Model | Key Indexes |
| :--- | :--- | :--- |
| `users` | `User` | Unique `githubId`, `githubUsername` |
| `repositories` | `Repository` | Compound unique `{ userId, githubRepositoryId }` |
| `pull_requests` | `PullRequest` | Compound unique `{ repositoryId, githubPRId }` & `{ repositoryId, prNumber }` |
| `reviews` | `Review` | Compound unique `{ pullRequestId, headSha }` |
| `findings` | `Finding` | Compound unique `{ reviewId, fingerprint }`, `{ reviewId, severity, category }` |
| `review_comments` | `ReviewComment` | `{ pullRequestId, fingerprint }`, `{ reviewId, findingId }` |
| `activity_logs` | `ActivityLog` | `{ userId, createdAt: -1 }`, TTL index (`LOG_RETENTION_DAYS`, default 90 days) |
| `webhook_deliveries` | `WebhookDelivery` | Unique `deliveryId`, TTL index (7 days) |

---

## REST API Reference

### Authentication
- `GET /api/auth/github` — Redirect to GitHub OAuth authorization
- `GET /api/auth/github/callback` — OAuth callback, token encryption, HttpOnly session cookie
- `POST /api/auth/logout` — Clear session cookie
- `GET /api/auth/me` — Get authenticated user profile
- `POST /api/auth/disconnect` — Remove encrypted GitHub OAuth token

### Repositories
- `GET /api/repositories` — List connected repositories with MongoDB review & finding stats
- `GET /api/repositories/github` — List accessible repositories from live GitHub API
- `GET /api/repositories/:id` — Repository detail, tracked PRs, and severity breakdown
- `POST /api/repositories/connect` — Connect repository, register webhook, sync open PRs
- `PATCH /api/repositories/:id/settings` — Toggle monitoring & configure per-repo review policy
- `POST /api/repositories/:id/sync` — Sync open Pull Requests from GitHub
- `DELETE /api/repositories/:id` — Disconnect repository & remove GitHub webhook

### Pull Requests
- `GET /api/pull-requests` — Paginated list with filters (`repositoryId`, `reviewStatus`, `severity`, `author`, `dateFrom`, `search`)
- `GET /api/pull-requests/:id` — PR detail + changed files + review history
- `POST /api/pull-requests/:id/review` — Enqueue manual AI review job via BullMQ

### Reviews & Findings
- `GET /api/reviews` — Paginated review history
- `GET /api/reviews/:id` — Detailed review, AI summary, findings, changed diffs, and GitHub comment status
- `GET /api/reviews/:id/findings` — Filtered findings list
- `POST /api/reviews/:id/publish` — Publish review summary + inline comments to GitHub (`comment_only` or `request_changes`)
- `POST /api/findings/:id/publish` — Publish a single finding as an inline GitHub PR comment
- `POST /api/findings/:id/dismiss` — Dismiss a finding and recalculate review severity counts

### Dashboard, Settings, Webhooks & Health
- `GET /api/dashboard/stats` — Real MongoDB KPI aggregations + BullMQ queue counts
- `GET /api/dashboard/analytics` — Time series, severity, category, and repository aggregations
- `GET /api/dashboard/activity` — Paginated audit & activity logs
- `GET /api/settings` / `PATCH /api/settings` — Default review policy, Gemini model, and notification settings
- `POST /api/webhooks/github` — HMAC-SHA256 verified GitHub webhook processor
- `GET /api/health` — Live readiness for MongoDB, Redis/BullMQ, GitHub OAuth, and Gemini AI

---

## Testing & Verification

```bash
# Run backend unit + MongoDB Mongoose + Express integration tests
npm test

# Typecheck both backend and frontend
npm run typecheck

# Production build for both backend and frontend
npm run build
```

---

## Production Deployment Checklist

1. **Secrets**: Set strong 64-char hex `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`, set `COOKIE_SECURE=true`, `NODE_ENV=production`.
2. **Database**: Provision **MongoDB Atlas** with IP allowlist / VPC peering and TLS enabled (`mongodb+srv://...`).
3. **Redis**: Provision managed Redis (e.g., Upstash / Redis Cloud with TLS `rediss://...`) for BullMQ reliability.
4. **Reverse Proxy**: Terminate HTTPS in front of Next.js (port 3000) and Express (port 4000). Set `FRONTEND_URL`, `BACKEND_URL`, `GITHUB_CALLBACK_URL`, and `GITHUB_WEBHOOK_PUBLIC_URL` to your HTTPS domain.
5. **Never auto-approve/merge**: PR Sentinel enforces `COMMENT` and `REQUEST_CHANGES` events only in `GitHubClient.createPullRequestReview` and never approves or merges pull requests.
