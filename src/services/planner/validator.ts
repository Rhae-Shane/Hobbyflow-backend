import { z } from 'zod';

const URL_PATTERN = /https?:\/\/|www\.\S/i;

function noUrls(value: string): boolean {
  return !URL_PATTERN.test(value);
}

const noUrlString = z
  .string()
  .min(1)
  .refine(noUrls, { message: 'URLs are not allowed in technique text' });

const optionalNoUrlString = z
  .string()
  .refine(noUrls, { message: 'URLs are not allowed in technique text' })
  .optional();

export const rawTechniqueSchema = z.object({
  name: noUrlString,
  why: optionalNoUrlString,
  order: z.number().int().positive(),
  modality: z.enum(['video', 'article', 'audio', 'interactive']).optional(),
  search_query: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
});

export const rawTechniqueResponseSchema = rawTechniqueSchema;

export const rawPlanResponseSchema = z.object({
  hobby: z.string().optional(),
  level: z.string().optional(),
  goal: z.string().optional(),
  techniques: z.array(rawTechniqueSchema).min(5).max(8),
});

export type RawPlanResponse = z.infer<typeof rawPlanResponseSchema>;
export type RawTechniqueResponse = z.infer<typeof rawTechniqueResponseSchema>;

export function validateRawPlanResponse(data: unknown): RawPlanResponse {
  return rawPlanResponseSchema.parse(data);
}

export function validateRawTechniqueResponse(data: unknown): RawTechniqueResponse {
  return rawTechniqueResponseSchema.parse(data);
}
