import mongoose, { Document, Schema, Types } from 'mongoose';
import { DEFAULT_REVIEW_SETTINGS, ReviewSettings } from '../types';

export interface IRepository extends Document {
  userId: Types.ObjectId;
  githubRepositoryId: number;
  name: string;
  fullName: string;
  owner: string;
  description: string;
  primaryLanguage: string;
  defaultBranch: string;
  htmlUrl: string;
  isPrivate: boolean;
  isMonitoringEnabled: boolean;
  webhookId: number | null;
  webhookSecretEncrypted: string;
  webhookStatus: 'active' | 'pending' | 'manual' | 'error';
  reviewSettings: ReviewSettings;
  lastReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const repositorySchema = new Schema<IRepository>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    githubRepositoryId: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true, index: true },
    owner: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    primaryLanguage: { type: String, default: 'Unknown' },
    defaultBranch: { type: String, default: 'main' },
    htmlUrl: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    isMonitoringEnabled: { type: Boolean, default: true, index: true },
    webhookId: { type: Number, default: null },
    webhookSecretEncrypted: { type: String, default: '', select: false },
    webhookStatus: {
      type: String,
      enum: ['active', 'pending', 'manual', 'error'],
      default: 'pending',
    },
    reviewSettings: {
      type: new Schema<ReviewSettings>(
        {
          autoReview: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.autoReview },
          enabledCategories: {
            type: [String],
            enum: ['bug', 'security', 'performance', 'code_quality'],
            default: DEFAULT_REVIEW_SETTINGS.enabledCategories,
          },
          minSeverity: {
            type: String,
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
            default: DEFAULT_REVIEW_SETTINGS.minSeverity,
          },
          enableBugDetection: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.enableBugDetection },
          enableSecurityAnalysis: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.enableSecurityAnalysis },
          enablePerformanceAnalysis: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.enablePerformanceAnalysis },
          enableCodeQualityAnalysis: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.enableCodeQualityAnalysis },
          reviewMode: {
            type: String,
            enum: ['comment_only', 'request_changes', 'manual'],
            default: DEFAULT_REVIEW_SETTINGS.reviewMode,
          },
          requireManualApproval: { type: Boolean, default: DEFAULT_REVIEW_SETTINGS.requireManualApproval },
          maxFilesPerBatch: { type: Number, min: 1, max: 30, default: DEFAULT_REVIEW_SETTINGS.maxFilesPerBatch },
          ignoredPaths: { type: [String], default: DEFAULT_REVIEW_SETTINGS.ignoredPaths },
        },
        { _id: false }
      ),
      default: () => ({ ...DEFAULT_REVIEW_SETTINGS }),
    },
    lastReviewedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'repositories',
  }
);

// Prevent duplicate connections for the same GitHub repository per user
repositorySchema.index({ userId: 1, githubRepositoryId: 1 }, { unique: true });
repositorySchema.index({ githubRepositoryId: 1, isMonitoringEnabled: 1 });

export const Repository = mongoose.model<IRepository>('Repository', repositorySchema);
