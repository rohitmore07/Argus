import { z } from 'zod';

export const publishReviewBodySchema = z.object({
  reviewMode: z.enum(['comment_only', 'request_changes']).optional(),
  findingIds: z.array(z.string()).max(50).optional(),
});

export const dismissFindingBodySchema = z.object({
  reason: z.string().max(500).optional().default(''),
});

export const listReviewsQuerySchema = z.object({
  repositoryId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const listFindingsQuerySchema = z.object({
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  category: z.enum(['bug', 'security', 'performance', 'code_quality']).optional(),
  status: z.enum(['open', 'published', 'dismissed', 'resolved']).optional(),
  filePath: z.string().optional(),
});
