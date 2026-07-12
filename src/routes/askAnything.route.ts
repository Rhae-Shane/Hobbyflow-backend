import { Router } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { askAnythingRequestSchema } from '../schemas/askAnything.schema';
import {
  archiveAskConversation,
  getAskConversation,
  listAskConversations,
} from '../services/ask/askConversationService';
import {
  AskAnythingUnavailableError,
  invokeAskAnythingSafe,
} from '../services/langgraph/askAnythingService';

const log = createChildLogger({ module: 'ask-anything.route' });

export const askAnythingRouter = Router();

askAnythingRouter.use(requireAuth);
askAnythingRouter.use(chatRateLimiter);

askAnythingRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  const parsed = askAnythingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  try {
    const result = await invokeAskAnythingSafe(parsed.data, req.user.id);
    log.info(
      { userId: req.user.id, conversationId: result.conversationId },
      'Ask Anything message handled',
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AskAnythingUnavailableError) {
      return next(error);
    }
    return next(error);
  }
});

askAnythingRouter.get('/conversations', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  try {
    const limit = Number(req.query.limit ?? 50);
    const conversations = await listAskConversations(req.user.id, Number.isFinite(limit) ? limit : 50);
    return res.status(200).json({ conversations });
  } catch (error) {
    return next(error);
  }
});

askAnythingRouter.get('/conversations/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const conversationId = String(req.params.id);

  try {
    const conversation = await getAskConversation(req.user.id, conversationId);
    return res.status(200).json({ conversation });
  } catch (error) {
    return next(error);
  }
});

askAnythingRouter.delete('/conversations/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const conversationId = String(req.params.id);

  try {
    await archiveAskConversation(req.user.id, conversationId);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});
