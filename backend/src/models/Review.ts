import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  ReviewMode,
  ReviewOverallStatus,
  ReviewProcessingStatus,
  ReviewSummaryData,
} from '../types';

export interface IReview extends Document {
  pullRequestId: Types.ObjectId;
  repositoryId: Types.ObjectId;
  headSha: string;
  triggerSource: 'webhook' | 'manual';
  reviewMode: ReviewMode;
  overallStatus: ReviewOverallStatus;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  summary: ReviewSummaryData;
  processingStatus: ReviewProcessingStatus;
  errorMessage: string | null;
  githubReviewId: number | null;
  llmProvider: string;
  llmModel: string;
  tokensUsed: number;
  filesAnalyzed: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSummarySchema = new Schema<ReviewSummaryData>(
  {
    overview: { type: String, default: '' },
    securitySummary: { type: String, default: '' },
    bugSummary: { type: String, default: '' },
    performanceSummary: { type: String, default: '' },
    codeQualitySummary: { type: String, default: '' },
    recommendedNextSteps: { type: [String], default: [] },
    markdown: { type: String, default: '' },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    pullRequestId: { type: Schema.Types.ObjectId, ref: 'PullRequest', required: true, index: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
    headSha: { type: String, required: true },
    triggerSource: { type: String, enum: ['webhook', 'manual'], default: 'webhook' },
    reviewMode: {
      type: String,
      enum: ['comment_only', 'request_changes', 'manual'],
      default: 'comment_only',
    },
    overallStatus: {
      type: String,
      enum: ['clean', 'commented', 'changes_requested', 'pending_approval', 'failed'],
      default: 'pending_approval',
      index: true,
    },
    totalFindings: { type: Number, default: 0 },
    criticalCount: { type: Number, default: 0 },
    highCount: { type: Number, default: 0 },
    mediumCount: { type: Number, default: 0 },
    lowCount: { type: Number, default: 0 },
    infoCount: { type: Number, default: 0 },
    summary: {
      type: reviewSummarySchema,
      default: () => ({
        overview: '',
        securitySummary: '',
        bugSummary: '',
        performanceSummary: '',
        codeQualitySummary: '',
        recommendedNextSteps: [],
        markdown: '',
      }),
    },
    processingStatus: {
      type: String,
      enum: [
        'queued',
        'fetching_context',
        'analyzing',
        'validating',
        'publishing',
        'awaiting_approval',
        'completed',
        'failed',
      ],
      default: 'queued',
      index: true,
    },
    errorMessage: { type: String, default: null },
    githubReviewId: { type: Number, default: null },
    llmProvider: { type: String, default: 'gemini' },
    llmModel: { type: String, default: 'gemini-2.5-flash' },
    tokensUsed: { type: Number, default: 0 },
    filesAnalyzed: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'reviews',
  }
);

// Compound unique index preventing duplicate reviews for the same PR commit SHA
reviewSchema.index({ pullRequestId: 1, headSha: 1 }, { unique: true });
reviewSchema.index({ repositoryId: 1, createdAt: -1 });
reviewSchema.index({ processingStatus: 1, createdAt: -1 });

export const Review = mongoose.model<IReview>('Review', reviewSchema);
