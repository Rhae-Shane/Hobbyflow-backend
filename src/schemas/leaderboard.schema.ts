import { z } from 'zod';

export const leaderboardUserIdsQuerySchema = z
  .object({
    kind: z.enum(['category', 'tag']),
    categoryId: z.coerce.number().int().positive().optional(),
    hobbyId: z.coerce.number().int().positive().nullable().optional(),
    tagName: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'category' && val.categoryId == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'categoryId is required for kind=category',
        path: ['categoryId'],
      });
    }
    if (val.kind === 'tag' && val.hobbyId == null && !val.tagName) {
      ctx.addIssue({
        code: 'custom',
        message: 'hobbyId or tagName is required for kind=tag',
        path: ['tagName'],
      });
    }
  });
