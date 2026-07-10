import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { roadmapCreationChatRequestSchema } from '../schemas/roadmapCreationChat.schema';
import {
  invokeRoadmapCreationChatSafe,
  RoadmapCreationUnavailableError,
} from '../services/langgraph/roadmapCreationChatService';
import { AppError, ErrorCodes } from '../lib/AppError';

const log = createChildLogger({ module: 'roadmap-creation.route' });

export const roadmapCreationChatRouter = Router();

roadmapCreationChatRouter.use(requireAuth);
roadmapCreationChatRouter.use(chatRateLimiter);

roadmapCreationChatRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  const parsed = roadmapCreationChatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  try {
    const result = await invokeRoadmapCreationChatSafe(parsed.data, { userId: req.user.id });
    log.info(
      {
        userId: req.user.id,
        type: result.type,
        flowState: result.flowState,
      },
      'Roadmap creation chat handled',
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof RoadmapCreationUnavailableError) {
      return next(
        new AppError(503, ErrorCodes.CHAT_UNAVAILABLE, error.message),
      );
    }
    return next(error);
  }
});
