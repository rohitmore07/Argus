import mongoose, { Document, Schema } from 'mongoose';
import {
  AIPreferences,
  DEFAULT_AI_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_REVIEW_SETTINGS,
  NotificationPreferences,
  ReviewSettings,
  UserRole,
} from '../types';

export interface IUser extends Document {
  name: string;
  email: string;
  githubId: string;
  githubUsername: string;
  githubAccessTokenEncrypted: string;
  githubConnected: boolean;
  avatarUrl: string;
  role: UserRole;
  defaultReviewSettings: ReviewSettings;
  aiPreferences: AIPreferences;
  notificationPreferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSettingsSubSchema = new Schema<ReviewSettings>(
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
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    githubId: { type: String, required: true, unique: true, index: true },
    githubUsername: { type: String, required: true, trim: true, index: true },
    githubAccessTokenEncrypted: { type: String, default: '', select: false },
    githubConnected: { type: Boolean, default: true },
    avatarUrl: { type: String, default: '' },
    role: {
      type: String,
      enum: ['admin', 'developer', 'viewer'],
      default: 'developer',
    },
    defaultReviewSettings: {
      type: reviewSettingsSubSchema,
      default: () => ({ ...DEFAULT_REVIEW_SETTINGS }),
    },
    aiPreferences: {
      type: new Schema<AIPreferences>(
        {
          provider: { type: String, enum: ['gemini'], default: DEFAULT_AI_PREFERENCES.provider },
          model: { type: String, default: DEFAULT_AI_PREFERENCES.model },
          temperature: { type: Number, min: 0, max: 1, default: DEFAULT_AI_PREFERENCES.temperature },
        },
        { _id: false }
      ),
      default: () => ({ ...DEFAULT_AI_PREFERENCES }),
    },
    notificationPreferences: {
      type: new Schema<NotificationPreferences>(
        {
          inAppEnabled: { type: Boolean, default: DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled },
          notifyOnCompletion: { type: Boolean, default: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnCompletion },
          notifyOnCriticalOnly: { type: Boolean, default: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnCriticalOnly },
          notifyOnFailure: { type: Boolean, default: DEFAULT_NOTIFICATION_PREFERENCES.notifyOnFailure },
          webhookUrl: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: () => ({ ...DEFAULT_NOTIFICATION_PREFERENCES }),
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

export const User = mongoose.model<IUser>('User', userSchema);
