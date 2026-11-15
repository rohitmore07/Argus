import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ActivityLog,
  Finding,
  PullRequest,
  Repository,
  Review,
  User,
  WebhookDelivery,
} from '../models';
import { SESSION_COOKIE_NAME } from '../middleware/auth';
import { encryptSecret } from '../utils/crypto';
import { signSessionToken } from '../utils/jwt';

let mongoServer: MongoMemoryServer;
const app = createApp();

describe('MongoDB Models, Aggregations & Express REST API Integration', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const connected = await connectDatabase(mongoServer.getUri());
    expect(connected).toBe(true);
    await Promise.all([
      User.syncIndexes(),
      Repository.syncIndexes(),
      PullRequest.syncIndexes(),
      Review.syncIndexes(),
      Finding.syncIndexes(),
      ActivityLog.syncIndexes(),
      WebhookDelivery.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Repository.deleteMany({}),
      PullRequest.deleteMany({}),
      Review.deleteMany({}),
      Finding.deleteMany({}),
      ActivityLog.deleteMany({}),
      WebhookDelivery.deleteMany({}),
    ]);
  });

  async function createAuthenticatedUser() {
    const user = await User.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      githubId: '10001',
      githubUsername: 'adalovelace',
      githubAccessTokenEncrypted: encryptSecret('gho_testtoken1234567890'),
      githubConnected: true,
      avatarUrl: 'https://avatars.githubusercontent.com/u/10001',
      role: 'admin',
    });

    const token = signSessionToken({
      userId: String(user._id),
      githubId: user.githubId,
      githubUsername: user.githubUsername,
      role: user.role,
    });

    return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
  }

  it('serves /api/health with live MongoDB connected status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.services.mongodb.connected).toBe(true);
    expect(res.body.services.ai.provider).toBe('gemini');
  });

  it('enforces authentication on protected routes and returns user profile for valid session', async () => {
    const unauth = await request(app).get('/api/auth/me');
    expect(unauth.status).toBe(401);

    const { cookie } = await createAuthenticatedUser();
    const authRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(authRes.status).toBe(200);
    expect(authRes.body.user.githubUsername).toBe('adalovelace');
    // Encrypted token must NEVER be exposed in API responses
    expect(authRes.body.user.githubAccessTokenEncrypted).toBeUndefined();
  });

  it('enforces compound unique indexes on Repositories, PullRequests, and Reviews', async () => {
    const { user } = await createAuthenticatedUser();
    const repo = await Repository.create({
      userId: user._id,
      githubRepositoryId: 777001,
      name: 'payments-api',
      fullName: 'acme/payments-api',
      owner: 'acme',
      primaryLanguage: 'TypeScript',
      defaultBranch: 'main',
    });

    // Duplicate repo for same user must fail with 11000
    await expect(
      Repository.create({
        userId: user._id,
        githubRepositoryId: 777001,
        name: 'payments-api',
        fullName: 'acme/payments-api',
        owner: 'acme',
      })
    ).rejects.toThrow();

    const pr = await PullRequest.create({
      repositoryId: repo._id,
      githubPRId: 9001,
      prNumber: 12,
      title: 'Add webhook signature verification',
      author: 'adalovelace',
      sourceBranch: 'feat/webhooks',
      targetBranch: 'main',
      headSha: 'abc1234567890',
      baseSha: 'def0987654321',
    });

    await Review.create({
      pullRequestId: pr._id,
      repositoryId: repo._id,
      headSha: 'abc1234567890',
      processingStatus: 'completed',
    });

    // Duplicate review for exact same (pullRequestId, headSha) must fail
    await expect(
      Review.create({
        pullRequestId: pr._id,
        repositoryId: repo._id,
        headSha: 'abc1234567890',
        processingStatus: 'queued',
      })
    ).rejects.toThrow();
  });

  it('computes real MongoDB dashboard stats, analytics, PR filters, and finding dismissal accurately', async () => {
    const { user, cookie } = await createAuthenticatedUser();

    // Empty state must return exact zeros (no fake stats)
    const emptyStats = await request(app).get('/api/dashboard/stats').set('Cookie', cookie);
    expect(emptyStats.status).toBe(200);
    expect(emptyStats.body.totalConnectedRepositories).toBe(0);
    expect(emptyStats.body.totalPullRequestsReviewed).toBe(0);
    expect(emptyStats.body.criticalIssuesDetected).toBe(0);

    // Seed real MongoDB documents
    const repo = await Repository.create({
      userId: user._id,
      githubRepositoryId: 888001,
      name: 'core-engine',
      fullName: 'acme/core-engine',
      owner: 'acme',
      primaryLanguage: 'TypeScript',
      defaultBranch: 'main',
      isMonitoringEnabled: true,
    });

    const pr = await PullRequest.create({
      repositoryId: repo._id,
      githubPRId: 5001,
      prNumber: 42,
      title: 'Refactor auth middleware',
      author: 'adalovelace',
      sourceBranch: 'fix/auth',
      targetBranch: 'main',
      headSha: '1111aaaa',
      baseSha: '0000bbbb',
      changedFilesCount: 2,
      reviewStatus: 'completed',
    });

    const review = await Review.create({
      pullRequestId: pr._id,
      repositoryId: repo._id,
      headSha: '1111aaaa',
      overallStatus: 'changes_requested',
      processingStatus: 'completed',
      totalFindings: 2,
      criticalCount: 1,
      highCount: 1,
      startedAt: new Date(Date.now() - 4000),
      completedAt: new Date(),
    });

    pr.latestReviewId = review._id;
    await pr.save();

    const [criticalFinding] = await Finding.create([
      {
        reviewId: review._id,
        pullRequestId: pr._id,
        repositoryId: repo._id,
        agentSource: 'security-analysis',
        category: 'security',
        severity: 'CRITICAL',
        title: 'Missing ownership authorization check',
        description: 'Handler returns any user record without checking req.user._id.',
        impact: 'IDOR data exposure.',
        recommendation: 'Scope query by req.user._id.',
        filePath: 'src/routes/users.ts',
        startLine: 22,
        endLine: 24,
        codeSnippet: 'const doc = await User.findById(req.params.id);',
        confidenceScore: 0.94,
        fingerprint: 'fp_idor_001',
      },
      {
        reviewId: review._id,
        pullRequestId: pr._id,
        repositoryId: repo._id,
        agentSource: 'bug-detection',
        category: 'bug',
        severity: 'HIGH',
        title: 'Unhandled promise rejection in session refresh',
        description: 'Async call inside non-awaited callback.',
        impact: 'Process crash on network error.',
        recommendation: 'Await promise inside try/catch.',
        filePath: 'src/routes/users.ts',
        startLine: 35,
        endLine: 36,
        codeSnippet: 'refreshSession(user.id);',
        confidenceScore: 0.89,
        fingerprint: 'fp_async_002',
      },
    ]);

    const statsRes = await request(app).get('/api/dashboard/stats').set('Cookie', cookie);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalConnectedRepositories).toBe(1);
    expect(statsRes.body.totalPullRequestsReviewed).toBe(1);
    expect(statsRes.body.securityVulnerabilitiesDetected).toBe(1);
    expect(statsRes.body.totalBugsDetected).toBe(1);
    expect(statsRes.body.criticalIssuesDetected).toBe(1);
    expect(statsRes.body.highSeverityIssues).toBe(1);

    const analyticsRes = await request(app).get('/api/dashboard/analytics').set('Cookie', cookie);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.repositoryActivity).toHaveLength(1);
    expect(analyticsRes.body.repositoryActivity[0].repository).toBe('acme/core-engine');

    const prsRes = await request(app)
      .get('/api/pull-requests?severity=CRITICAL&author=ada')
      .set('Cookie', cookie);
    expect(prsRes.status).toBe(200);
    expect(prsRes.body.items).toHaveLength(1);
    expect(prsRes.body.items[0].prNumber).toBe(42);

    // Dismissing a finding recalculates Review & Dashboard counts accurately
    const dismissRes = await request(app)
      .post(`/api/findings/${criticalFinding._id}/dismiss`)
      .set('Cookie', cookie)
      .send({ reason: 'False positive in internal admin route' });
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.finding.status).toBe('dismissed');

    const updatedStats = await request(app).get('/api/dashboard/stats').set('Cookie', cookie);
    expect(updatedStats.body.criticalIssuesDetected).toBe(0);
    expect(updatedStats.body.totalIssuesDetected).toBe(1);
  });

  it('validates GitHub webhook signatures and enforces idempotent delivery handling', async () => {
    const { user } = await createAuthenticatedUser();
    const webhookSecret = 'repo-secret-abc-999';

    await Repository.create({
      userId: user._id,
      githubRepositoryId: 555001,
      name: 'web-app',
      fullName: 'acme/web-app',
      owner: 'acme',
      webhookSecretEncrypted: encryptSecret(webhookSecret),
      isMonitoringEnabled: true,
    });

    const payload = JSON.stringify({
      zen: 'Keep it logically awesome.',
      repository: { id: 555001, name: 'web-app', full_name: 'acme/web-app' },
    });

    // Invalid signature -> 401
    const badRes = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'ping')
      .set('X-GitHub-Delivery', 'delivery-001')
      .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(payload);
    expect(badRes.status).toBe(401);

    // Valid signature -> 200 pong
    const validSig =
      'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const okRes = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'ping')
      .set('X-GitHub-Delivery', 'delivery-002')
      .set('X-Hub-Signature-256', validSig)
      .send(payload);
    expect(okRes.status).toBe(200);
    expect(okRes.body.reason).toBe('pong');

    // Replay same deliveryId -> ignored idempotently
    const replayRes = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'ping')
      .set('X-GitHub-Delivery', 'delivery-002')
      .set('X-Hub-Signature-256', validSig)
      .send(payload);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.reason).toBe('duplicate_delivery_ignored');
  });
});
