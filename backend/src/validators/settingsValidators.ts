import { z } from 'zod';
import { reviewSettingsPatchSchema } from './repositoryValidators';

export const updateUserSettingsSchema = z.object({
  defaultReviewSettings: reviewSettingsPatchSchema.optional(),
  aiPreferences: z
    .object({
      provider: z.enum(['gemini']).optional(),
      model: z.string().min(2).max(100).optional(),
      temperature: z.number().min(0).max(1).optional(),
    })
    .optional(),
  notificationPreferences: z
    .object({
      inAppEnabled: z.boolean().optional(),
      notifyOnCompletion: z.boolean().optional(),
      notifyOnCriticalOnly: z.boolean().optional(),
      notifyOnFailure: z.boolean().optional(),
      webhookUrl: z.string().max(500).optional(),
    })
    .optional(),
});
