import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().trim().min(1, 'Message content is required').max(8_000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required').max(50),
  hobby: z.string().trim().min(1).max(100).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
