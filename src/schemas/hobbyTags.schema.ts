import { z } from 'zod';

export const MAX_USER_HOBBY_TAGS = 20;
export const MAX_TAGS_PER_CONFIRM = 5;

export const hobbyTagSchema = z
  .object({
    hobbyId: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(80),
    source: z.enum(['catalog', 'custom']),
  })
  .superRefine((val, ctx) => {
    if (val.source === 'catalog' && val.hobbyId == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'catalog tags require hobbyId',
        path: ['hobbyId'],
      });
    }
    if (val.source === 'custom' && val.hobbyId != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'custom tags must have hobbyId null',
        path: ['hobbyId'],
      });
    }
  });

export const hobbyTagsArraySchema = z.array(hobbyTagSchema).max(MAX_TAGS_PER_CONFIRM);

export type HobbyTag = z.infer<typeof hobbyTagSchema>;
