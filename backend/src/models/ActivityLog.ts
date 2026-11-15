import mongoose, { Document, Schema, Types } from 'mongoose';
import { env } from '../config/env';

export type ActivityEventType =
  | 'auth.connected'
  | 'auth.disconnected'
  | 'repository.connected'
  | 'repository.disconnected'
  | 'repository.settings_updated'
  | 'webhook.received'
  | 'webhook.rejected'
  | 'pr.synced'
  | 'review.queued'
  | 'review.started'
  | 'review.completed'
  | 'review.awaiting_approval'
  | 'review.failed'
  | 'review.published'
  | 'finding.published'
  | 'finding.dismissed';

export interface IActivityLog extends Document {
  userId: Types.ObjectId;
  repositoryId?: Types.ObjectId | null;
  pullRequestId?: Types.ObjectId | null;
  eventType: ActivityEventType;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', default: null, index: true },
    pullRequestId: { type: Schema.Types.ObjectId, ref: 'PullRequest', default: null },
    eventType: { type: String, required: true, index: true },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'activity_logs',
  }
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
// Automated MongoDB TTL log retention policy (default 90 days)
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: env.LOG_RETENTION_DAYS * 24 * 60 * 60 }
);

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
