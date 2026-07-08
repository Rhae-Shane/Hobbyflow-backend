import { z } from 'zod';
import { levelSchema } from './planRequest.schema';

export const replaceRequestSchema = z.object({
  techniqueId: z.string().min(1),
  hobby: z.string().trim().min(1),
  level: levelSchema,
  goal: z.string().trim().optional().default(''),
  remainingTechniques: z.array(z.string().trim().min(1)).min(1),
});

export type ReplaceRequest = z.infer<typeof replaceRequestSchema>;
