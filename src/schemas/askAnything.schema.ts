import { z } from 'zod';

export const askAnythingMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(8_000),
});

export const askAnythingRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(2_000),
  messages: z.array(askAnythingMessageSchema).max(40).default([]),
  conversationId: z.string().uuid().optional(),
  activeHobbyHint: z.string().trim().min(1).max(100).optional(),
  localDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD')
    .optional(),
});

export type AskAnythingRequest = z.infer<typeof askAnythingRequestSchema>;

export const askAnythingResponseSchema = z.object({
  message: z.object({
    role: z.literal('assistant'),
    content: z.string(),
  }),
  conversationId: z.string().uuid(),
  toolsUsed: z.array(z.string()).optional(),
});

export type AskAnythingResponse = z.infer<typeof askAnythingResponseSchema>;
