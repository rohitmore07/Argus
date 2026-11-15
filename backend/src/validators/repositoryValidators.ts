import { z } from 'zod';

const severityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
const categoryEnum = z.enum(['bug', 'security', 'performance', 'code_quality']);
const reviewModeEnum = z.enum(['comment_only', 'request_changes', 'manual']);

export const reviewSettingsPatchSchema = z.object({
  autoReview: z.boolean().optional(),
  enabledCategories: z.array(categoryEnum).optional(),
  minSeverity: severityEnum.optional(),
  enableBugDetection: z.boolean().optional(),
  enableSecurityAnalysis: z.boolean().optional(),
  enablePerformanceAnalysis: z.boolean().optional(),
  enableCodeQualityAnalysis: z.boolean().optional(),
  reviewMode: reviewModeEnum.optional(),
  requireManualApproval: z.boolean().optional(),
  maxFilesPerBatch: z.number().int().min(1).max(30).optional(),
  ignoredPaths: z.array(z.string().max(200)).max(50).optional(),
});

export const connectRepositorySchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  isMonitoringEnabled: z.boolean().optional(),
  setupWebhook: z.boolean().optional(),
  reviewSettings: reviewSettingsPatchSchema.optional(),
});

export const updateRepositorySettingsSchema = z.object({
  isMonitoringEnabled: z.boolean().optional(),
  reviewSettings: reviewSettingsPatchSchema.optional(),
});
