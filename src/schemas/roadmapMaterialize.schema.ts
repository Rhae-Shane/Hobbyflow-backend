import { z } from 'zod';
import { hobbyTagsArraySchema } from './hobbyTags.schema';

export const goalCardSchema = z.object({
  suggestedHobby: z.string().min(1).max(120),
  suggestedName: z.string().min(1).max(200),
  suggestedGoal: z.string().min(1).max(2000),
  suggestedBackground: z.string().min(1).max(2000),
  suggestedLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  suggestedTags: hobbyTagsArraySchema.default([]),
});

export const lessonPlanLessonSchema = z.object({
  name: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  meaning: z.string().min(1).max(500),
});

export const lessonPlanSectionSchema = z.object({
  name: z.string().min(1).max(200),
  lessons: z.array(lessonPlanLessonSchema).min(1).max(8),
});

export const materializeLessonPlanSchema = z.object({
  courseTitle: z.string().min(1).max(200),
  sections: z.array(lessonPlanSectionSchema).min(2).max(8),
  stage: z.literal('outline'),
  lessonPlanId: z.string().uuid(),
});

export const materializeRoadmapRequestSchema = z.object({
  hobby: z.string().min(1).max(120),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  goalCard: goalCardSchema,
  lessonPlan: materializeLessonPlanSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .default([]),
  userRoles: z.array(z.string()).default([]),
  conversationId: z.string().uuid().optional(),
  learnerContextSummary: z.string().max(8000).optional(),
  isFirstRoadmap: z.boolean().default(true),
});

export type MaterializeRoadmapRequest = z.infer<typeof materializeRoadmapRequestSchema>;

export const materializeRoadmapResponseSchema = z.object({
  roadmapId: z.string().uuid(),
  hobbyId: z.string().uuid(),
  title: z.string(),
  intro: z.object({
    intro: z.string(),
    achievements: z.string(),
  }),
  coverImageUrl: z.string().nullable(),
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      lessonCount: z.number().int().nonnegative(),
    }),
  ),
  lessonCount: z.number().int().nonnegative(),
});

export type MaterializeRoadmapResponse = z.infer<typeof materializeRoadmapResponseSchema>;
