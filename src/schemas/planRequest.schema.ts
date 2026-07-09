import { z } from 'zod';

export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const timeBudgetSchema = z.enum(['15 min/day', '30 min/day', '1 hr/day']);

export const planRequestSchema = z.object({
  hobby: z.string().trim().min(1, 'Hobby is required'),
  level: levelSchema,
  goal: z.string().trim().optional().default(''),
  timeBudget: timeBudgetSchema,
  learnerContext: z.string().trim().max(8000).optional(),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;
