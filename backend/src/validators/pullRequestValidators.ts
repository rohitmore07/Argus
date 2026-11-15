import { z } from 'zod';

export const listPullRequestsQuerySchema = z.object({
  repositoryId: z.string().optional(),
  reviewStatus: z
    .enum([
      'pending',
      'queued',
      'in_progress',
      'completed',
      'awaiting_approval',
      'failed',
      'skipped',
    ])
    .optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  author: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
