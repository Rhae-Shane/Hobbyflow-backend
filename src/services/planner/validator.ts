import { z } from 'zod';

const rawTechniqueSchema = z.object({
  name: z.string().min(1),
  why: z.string().optional(),
  order: z.number().int().positive(),
  modality: z.enum(['video', 'article', 'audio', 'interactive']).optional(),
  search_query: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
});

export const rawPlanResponseSchema = z.object({
  hobby: z.string().optional(),
  level: z.string().optional(),
  goal: z.string().optional(),
  techniques: z.array(rawTechniqueSchema).min(1).max(8),
});

export type RawPlanResponse = z.infer<typeof rawPlanResponseSchema>;

export function validateRawPlanResponse(data: unknown): RawPlanResponse {
  return rawPlanResponseSchema.parse(data);
}
