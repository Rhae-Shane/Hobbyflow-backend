import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { chatRequestSchema } from '../schemas/chatRequest.schema';
import { ChatUnavailableError, invokeChat, streamChat } from '../services/langgraph/chatService';

const log = createChildLogger({ module: 'chat.route' });

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.use(chatRateLimiter);

function forwardChatError(error: unknown, next: (err: unknown) => void) {
  if (error instanceof ChatUnavailableError) {
    next(error);
    return;
  }
  next(error);
}

chatRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  const parsed = chatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const result = await invokeChat(parsed.data);
    log.info({ userId: req.user?.id, hobby: parsed.data.hobby }, 'Chat message handled');
    return res.status(200).json(result);
  } catch (error) {
    forwardChatError(error, next);
  }
});

chatRouter.post('/stream', async (req: AuthenticatedRequest, res, next) => {
  const parsed = chatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    for await (const event of streamChat(parsed.data)) {
      if (event.type === 'token') {
        res.write(`data: ${JSON.stringify({ type: 'token', content: event.content })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    }

    log.info({ userId: req.user?.id, hobby: parsed.data.hobby }, 'Chat stream handled');
    return res.end();
  } catch (error) {
    if (!res.headersSent) {
      forwardChatError(error, next);
      return;
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        message: error instanceof ChatUnavailableError ? error.message : 'Chat stream failed',
      })}\n\n`,
    );
    return res.end();
  }
});
