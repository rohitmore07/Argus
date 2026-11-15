import mongoose, { Document, Schema, Types } from 'mongoose';
import { AgentSource, FindingCategory, FindingStatus, Severity } from '../types';

export interface IFinding extends Document {
  reviewId: Types.ObjectId;
  pullRequestId: Types.ObjectId;
  repositoryId: Types.ObjectId;
  agentSource: AgentSource;
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
  dismissedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const findingSchema = new Schema<IFinding>(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
    pullRequestId: { type: Schema.Types.ObjectId, ref: 'PullRequest', required: true, index: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
    agentSource: {
      type: String,
      enum: [
        'bug-detection',
        'security-analysis',
        'performance-analysis',
        'code-quality',
        'static-analysis',
      ],
      required: true,
    },
    category: {
      type: String,
      enum: ['bug', 'security', 'performance', 'code_quality'],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    impact: { type: String, required: true },
    recommendation: { type: String, required: true },
    filePath: { type: String, required: true, index: true },
    startLine: { type: Number, required: true, min: 1 },
    endLine: { type: Number, required: true, min: 1 },
    codeSnippet: { type: String, default: '' },
    suggestedFix: { type: String, default: '' },
    confidenceScore: { type: Number, required: true, min: 0, max: 1 },
    status: {
      type: String,
      enum: ['open', 'published', 'dismissed', 'resolved'],
      default: 'open',
      index: true,
    },
    fingerprint: { type: String, required: true, index: true },
    cwe: { type: String, default: '' },
    owasp: { type: String, default: '' },
    dismissReason: { type: String, default: '' },
    dismissedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'findings',
  }
);

findingSchema.index({ reviewId: 1, severity: 1, category: 1 });
findingSchema.index({ reviewId: 1, fingerprint: 1 }, { unique: true });
findingSchema.index({ repositoryId: 1, createdAt: -1 });

export const Finding = mongoose.model<IFinding>('Finding', findingSchema);
