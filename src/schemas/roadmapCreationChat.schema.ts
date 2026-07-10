import { z } from 'zod';

export const roadmapCreationFlowStateSchema = z.enum([
  'collecting-input',
  'clarifying',
  'confirming-goal',
]);

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const quickReplySchema = z.object({
  text: z.string().min(1).max(200),
});

export const clarificationResponseSchema = z.object({
  type: z.literal('clarification'),
  message: z.string().min(1),
  quickReplies: z.array(quickReplySchema).min(2).max(6),
  multiSelect: z.boolean(),
  flowState: z.enum(['collecting-input', 'clarifying']),
});

export const goalSuggestionResponseSchema = z.object({
  type: z.literal('goal_suggestion'),
  message: z.string().min(1),
  suggestedHobby: z.string().min(1).max(120),
  suggestedName: z.string().min(1).max(200),
  suggestedGoal: z.string().min(1).max(2000),
  suggestedBackground: z.string().min(1).max(2000),
  suggestedLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  flowState: z.literal('confirming-goal'),
});

export const roadmapCreationChatResponseSchema = z.discriminatedUnion('type', [
  clarificationResponseSchema,
  goalSuggestionResponseSchema,
]);

export const roadmapCreationChatRequestSchema = z.object({
  message: z.string(),
  messages: z.array(chatMessageSchema).min(1),
  flowState: roadmapCreationFlowStateSchema,
  userRoles: z.array(z.string()).default([]),
  isFirstRoadmap: z.boolean(),
  roadmapName: z.string().optional(),
  roadmapGoal: z.string().optional(),
  roadmapBackground: z.string().optional(),
  conversationId: z.string().uuid().optional(),
});

export const storedChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  type: z.enum(['text', 'clarification', 'goal_suggestion']),
  content: z.string(),
  metadata: z
    .object({
      quickReplies: z.array(quickReplySchema).optional(),
      multiSelect: z.boolean().optional(),
      suggestedHobby: z.string().optional(),
      suggestedName: z.string().optional(),
      suggestedGoal: z.string().optional(),
      suggestedBackground: z.string().optional(),
      suggestedLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    })
    .optional(),
});

export type RoadmapCreationFlowState = z.infer<typeof roadmapCreationFlowStateSchema>;
export type ClarificationResponse = z.infer<typeof clarificationResponseSchema>;
export type GoalSuggestionResponse = z.infer<typeof goalSuggestionResponseSchema>;
export type RoadmapCreationChatResponse = z.infer<typeof roadmapCreationChatResponseSchema>;
export type RoadmapCreationChatRequest = z.infer<typeof roadmapCreationChatRequestSchema>;
export type StoredChatMessage = z.infer<typeof storedChatMessageSchema>;

/** Target 4 MCQ rounds; hard cap at 5 before goal_suggestion is required. */
export const MIN_CLARIFICATION_ROUNDS = 4;
export const MAX_CLARIFICATION_ROUNDS = 5;

/**
 * Format multi-select MCQ answer: chips prefixed with "- ", free text appended.
 */
export function formatClarificationAnswer(
  selectedChips: string[],
  freeText: string,
): string {
  const chipLines = selectedChips.map((chip) => `- ${chip.trim()}`).filter((line) => line.length > 2);
  const text = freeText.trim();
  return [...chipLines, ...(text ? [text] : [])].join('\n');
}
