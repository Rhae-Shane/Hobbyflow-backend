import { z } from 'zod';

export const exerciseLocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'local_date must be YYYY-MM-DD');

export const listExercisesQuerySchema = z.object({
  lessonId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
});

export const generateExercisesBodySchema = z.object({
  force: z.boolean().optional(),
});

export const completeExerciseBodySchema = z.object({
  local_date: exerciseLocalDateSchema,
});

export const exerciseAgentItemSchema = z.object({
  title: z.string().trim().min(1).max(80),
  instructions: z.string().trim().min(1).max(800),
});

export const exerciseAgentBatchOutputSchema = z.object({
  exercises: z.array(exerciseAgentItemSchema).min(2).max(3),
});

export const exerciseAgentSingleOutputSchema = exerciseAgentItemSchema;

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type GenerateExercisesBody = z.infer<typeof generateExercisesBodySchema>;
export type CompleteExerciseBody = z.infer<typeof completeExerciseBodySchema>;
export type ExerciseAgentBatchOutput = z.infer<typeof exerciseAgentBatchOutputSchema>;
export type ExerciseAgentSingleOutput = z.infer<typeof exerciseAgentSingleOutputSchema>;
