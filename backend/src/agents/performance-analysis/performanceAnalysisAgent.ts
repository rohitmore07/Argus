import { BaseReviewAgent } from '../baseAgent';

export class PerformanceAnalysisAgent extends BaseReviewAgent {
  readonly agentSource = 'performance-analysis' as const;
  readonly category = 'performance' as const;
  readonly roleDescription = 'Performance Analysis Agent (Principal Systems & Performance Engineer)';
  readonly focusChecklist = [
    'N+1 database query patterns (awaiting DB calls inside loops instead of batching with $in / aggregation)',
    'Unnecessary or redundant database queries and missing projection/field selection on large documents',
    'Inefficient nested loops (O(n^2) lookups where a Set/Map would give O(n)) on unbounded collections',
    'Expensive synchronous/blocking CPU computations on the Node.js event loop (blocking crypto, sync fs, catastrophic regex ReDoS)',
    'Unnecessary React re-renders (creating heavy inline objects/closures/computations in hot render paths, missing memoization where measurable)',
    'Memory-intensive operations (loading unbounded collections or full files into memory instead of streaming/chunking)',
    'Unoptimized sequential network/API requests that can safely run concurrently with bounded concurrency',
    'Missing pagination or unbounded `.find()` queries on growing collections',
    'Missed high-impact caching opportunities for immutable or frequently read data',
    'CRITICAL RULE: Only report performance issues with concrete, meaningful evidence — skip micro-optimizations',
  ];
}
