import { Types } from 'mongoose';
import { ActivityLog, Finding, PullRequest, Repository, Review } from '../models';
import { getQueueMetrics } from '../queues/reviewQueue';

/**
 * Returns real-time KPI statistics aggregated strictly from MongoDB collections.
 * Never returns hardcoded or mocked figures.
 */
export async function getDashboardStats(userId: string) {
  const userRepos = await Repository.find({ userId }).select('_id isMonitoringEnabled').lean();
  const repoIds = userRepos.map((r) => r._id);
  const queueMetrics = await getQueueMetrics();

  if (repoIds.length === 0) {
    return {
      totalConnectedRepositories: 0,
      activeMonitoredRepositories: 0,
      totalPullRequestsReviewed: 0,
      totalPullRequestsTracked: 0,
      totalIssuesDetected: 0,
      totalBugsDetected: 0,
      securityVulnerabilitiesDetected: 0,
      performanceIssuesDetected: 0,
      codeQualityIssuesDetected: 0,
      criticalIssuesDetected: 0,
      highSeverityIssues: 0,
      mediumSeverityIssues: 0,
      lowSeverityIssues: 0,
      infoSeverityIssues: 0,
      processingStats: {
        completed: 0,
        awaitingApproval: 0,
        inProgress: 0,
        failed: 0,
        avgDurationMs: 0,
        queue: queueMetrics,
      },
    };
  }

  const [prTrackedCount, reviewStatsAgg, findingStatsAgg] = await Promise.all([
    PullRequest.countDocuments({ repositoryId: { $in: repoIds } }),
    Review.aggregate([
      { $match: { repositoryId: { $in: repoIds } } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$processingStatus', 'completed'] }, 1, 0] },
          },
          awaitingApproval: {
            $sum: { $cond: [{ $eq: ['$processingStatus', 'awaiting_approval'] }, 1, 0] },
          },
          inProgress: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$processingStatus',
                    ['queued', 'fetching_context', 'analyzing', 'validating', 'publishing'],
                  ],
                },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$processingStatus', 'failed'] }, 1, 0] },
          },
          avgDurationMs: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$startedAt', null] }, { $ne: ['$completedAt', null] }] },
                { $subtract: ['$completedAt', '$startedAt'] },
                null,
              ],
            },
          },
        },
      },
    ]),
    Finding.aggregate([
      { $match: { repositoryId: { $in: repoIds }, status: { $ne: 'dismissed' } } },
      {
        $group: {
          _id: null,
          totalIssues: { $sum: 1 },
          bugs: { $sum: { $cond: [{ $eq: ['$category', 'bug'] }, 1, 0] } },
          security: { $sum: { $cond: [{ $eq: ['$category', 'security'] }, 1, 0] } },
          performance: { $sum: { $cond: [{ $eq: ['$category', 'performance'] }, 1, 0] } },
          codeQuality: { $sum: { $cond: [{ $eq: ['$category', 'code_quality'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] } },
          info: { $sum: { $cond: [{ $eq: ['$severity', 'INFO'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const r = reviewStatsAgg[0] || {};
  const f = findingStatsAgg[0] || {};

  return {
    totalConnectedRepositories: userRepos.length,
    activeMonitoredRepositories: userRepos.filter((repo) => repo.isMonitoringEnabled).length,
    totalPullRequestsReviewed: r.totalReviews || 0,
    totalPullRequestsTracked: prTrackedCount,
    totalIssuesDetected: f.totalIssues || 0,
    totalBugsDetected: f.bugs || 0,
    securityVulnerabilitiesDetected: f.security || 0,
    performanceIssuesDetected: f.performance || 0,
    codeQualityIssuesDetected: f.codeQuality || 0,
    criticalIssuesDetected: f.critical || 0,
    highSeverityIssues: f.high || 0,
    mediumSeverityIssues: f.medium || 0,
    lowSeverityIssues: f.low || 0,
    infoSeverityIssues: f.info || 0,
    processingStats: {
      completed: r.completed || 0,
      awaitingApproval: r.awaitingApproval || 0,
      inProgress: r.inProgress || 0,
      failed: r.failed || 0,
      avgDurationMs: Math.round(r.avgDurationMs || 0),
      queue: queueMetrics,
    },
  };
}

/**
 * MongoDB aggregation pipelines powering Dashboard Analytics charts:
 * - Issues detected over time (last N days)
 * - Issues by severity
 * - Issues by category
 * - Repository review activity
 */
export async function getDashboardAnalytics(userId: string, days = 30) {
  const safeDays = Math.min(90, Math.max(7, days));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const userRepos = await Repository.find({ userId }).select('_id name fullName').lean();
  const repoIds = userRepos.map((r) => r._id);
  const repoNameMap = new Map(userRepos.map((r) => [String(r._id), r.fullName]));

  if (repoIds.length === 0) {
    return {
      rangeDays: safeDays,
      issuesOverTime: [],
      issuesBySeverity: [
        { severity: 'CRITICAL', count: 0 },
        { severity: 'HIGH', count: 0 },
        { severity: 'MEDIUM', count: 0 },
        { severity: 'LOW', count: 0 },
        { severity: 'INFO', count: 0 },
      ],
      issuesByCategory: [
        { category: 'security', label: 'Security', count: 0 },
        { category: 'bug', label: 'Bugs', count: 0 },
        { category: 'performance', label: 'Performance', count: 0 },
        { category: 'code_quality', label: 'Code Quality', count: 0 },
      ],
      repositoryActivity: [],
    };
  }

  const [overTimeAgg, severityAgg, categoryAgg, repoActivityAgg] = await Promise.all([
    Finding.aggregate([
      {
        $match: {
          repositoryId: { $in: repoIds },
          status: { $ne: 'dismissed' },
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] } },
          low: {
            $sum: {
              $cond: [{ $in: ['$severity', ['LOW', 'INFO']] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Finding.aggregate([
      { $match: { repositoryId: { $in: repoIds }, status: { $ne: 'dismissed' } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Finding.aggregate([
      { $match: { repositoryId: { $in: repoIds }, status: { $ne: 'dismissed' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Review.aggregate([
      { $match: { repositoryId: { $in: repoIds } } },
      {
        $group: {
          _id: '$repositoryId',
          reviewsCount: { $sum: 1 },
          findingsCount: { $sum: '$totalFindings' },
          criticalCount: { $sum: '$criticalCount' },
        },
      },
      { $sort: { reviewsCount: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const severityMap = new Map(severityAgg.map((s) => [String(s._id), Number(s.count)]));
  const categoryMap = new Map(categoryAgg.map((c) => [String(c._id), Number(c.count)]));

  return {
    rangeDays: safeDays,
    issuesOverTime: overTimeAgg.map((row) => ({
      date: row._id,
      total: row.total,
      critical: row.critical,
      high: row.high,
      medium: row.medium,
      low: row.low,
    })),
    issuesBySeverity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).map((sev) => ({
      severity: sev,
      count: severityMap.get(sev) || 0,
    })),
    issuesByCategory: [
      { category: 'security', label: 'Security', count: categoryMap.get('security') || 0 },
      { category: 'bug', label: 'Bugs', count: categoryMap.get('bug') || 0 },
      { category: 'performance', label: 'Performance', count: categoryMap.get('performance') || 0 },
      {
        category: 'code_quality',
        label: 'Code Quality',
        count: categoryMap.get('code_quality') || 0,
      },
    ],
    repositoryActivity: repoActivityAgg.map((row) => ({
      repositoryId: String(row._id),
      repository: repoNameMap.get(String(row._id)) || 'Unknown',
      reviewsCount: row.reviewsCount,
      findingsCount: row.findingsCount,
      criticalCount: row.criticalCount,
    })),
  };
}

export async function getDashboardActivity(
  userId: string,
  options: { page?: number; limit?: number } = {}
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(50, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const query = { userId: new Types.ObjectId(userId) };
  const [total, items] = await Promise.all([
    ActivityLog.countDocuments(query),
    ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('repositoryId', 'name fullName')
      .populate('pullRequestId', 'prNumber title latestReviewId')
      .lean(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
