import { z } from 'zod';

export const dailyTaskDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'task_date must be YYYY-MM-DD');

export const generateDailyTaskSchema = z.object({
  task_date: dailyTaskDateSchema,
  mode: z.enum(['primary', 'regenerate', 'bonus']),
});

export const dailyTaskAgentOutputSchema = z.object({
  title: z.string().min(8).max(120),
  hobby_id: z.string().uuid(),
  task_type: z.enum(['complete_lesson', 'practice_minutes', 'custom']),
  minutes: z.number().int().min(5).max(60).optional(),
  rationale: z.string().max(300).optional(),
});

export type GenerateDailyTaskInput = z.infer<typeof generateDailyTaskSchema>;
export type DailyTaskAgentOutput = z.infer<typeof dailyTaskAgentOutputSchema>;
