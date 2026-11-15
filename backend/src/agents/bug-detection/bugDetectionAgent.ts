import { BaseReviewAgent } from '../baseAgent';

export class BugDetectionAgent extends BaseReviewAgent {
  readonly agentSource = 'bug-detection' as const;
  readonly category = 'bug' as const;
  readonly roleDescription = 'Bug Detection Agent (Staff Reliability & Correctness Engineer)';
  readonly focusChecklist = [
    'Null, undefined, and optional-chaining reference errors that can crash at runtime',
    'Incorrect conditional logic, inverted booleans, off-by-one errors, and broken comparisons',
    'Logical flaws, incorrect calculations, precision/rounding issues, and timezone/date mistakes',
    'Race conditions, stale closures, concurrent state mutation, and non-atomic updates',
    'Async/await mistakes: missing await, unhandled Promise rejections, floating promises, incorrect Promise.all error semantics',
    'Unhandled exceptions, swallowed errors, and broken fallback branches',
    'Resource and memory leaks (uncleaned listeners, intervals, subscriptions, streams, DB cursors)',
    'Incorrect API response handling, missing HTTP status checks, malformed payload assumptions',
    'Missing boundary/edge cases (empty arrays, zero, negative values, partial failures)',
    'Broken React/server state management and broken multi-step application control flows',
    'Always read the surrounding file context before flagging an issue to avoid false positives',
  ];
}
