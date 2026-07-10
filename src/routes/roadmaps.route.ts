import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { plansRateLimiter } from '../middleware/rateLimiter';
import { materializeRoadmapRequestSchema } from '../schemas/roadmapMaterialize.schema';
import { generateMindMapRequestSchema } from '../schemas/roadmapMindMap.schema';
import { generateLessonRequestSchema } from '../schemas/lessonContent.schema';
import { AppError, ErrorCodes } from '../lib/AppError';
import {
  activateRoadmap,
  getRoadmapDetail,
  materializeRoadmap,
} from '../services/roadmap/materializeService';
import { generateOrGetMindMap } from '../services/roadmap/mindmapService';
import { generateLessonContentTraced } from '../services/roadmap/lessonGenerationService';

const log = createChildLogger({ module: 'roadmaps.route' });

export const roadmapsRouter = Router();

roadmapsRouter.use(requireAuth);
roadmapsRouter.use(plansRateLimiter);

roadmapsRouter.post('/materialize', async (req: AuthenticatedRequest, res, next) => {
  const parsed = materializeRoadmapRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  try {
    const result = await materializeRoadmap(req.user.id, parsed.data);
    log.info(
      {
        userId: req.user.id,
        roadmapId: result.roadmapId,
        lessonCount: result.lessonCount,
      },
      'Roadmap materialize handled',
    );
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

roadmapsRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!roadmapId) {
    return next(new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id is required'));
  }

  try {
    const detail = await getRoadmapDetail(req.user.id, roadmapId);
    return res.status(200).json(detail);
  } catch (error) {
    return next(error);
  }
});

roadmapsRouter.post('/:id/activate', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!roadmapId) {
    return next(new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id is required'));
  }

  try {
    const result = await activateRoadmap(req.user.id, roadmapId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

roadmapsRouter.post('/:id/mindmap', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!roadmapId) {
    return next(new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id is required'));
  }

  const parsed = generateMindMapRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const result = await generateOrGetMindMap(req.user.id, roadmapId, parsed.data);
    log.info(
      {
        userId: req.user.id,
        roadmapId,
        cached: result.cached,
        lessonCount: result.mindMap.metadata.lessonCount,
      },
      'Roadmap mind map handled',
    );
    return res.status(result.cached ? 200 : 201).json({ mindMap: result.mindMap });
  } catch (error) {
    return next(error);
  }
});

roadmapsRouter.post(
  '/:id/lessons/:lessonId/generate',
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.id) {
      return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
    }

    const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    const lessonId =
      typeof req.params.lessonId === 'string' ? req.params.lessonId : req.params.lessonId?.[0];

    if (!roadmapId || !lessonId) {
      return next(
        new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id and lesson id are required'),
      );
    }

    const parsed = generateLessonRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(toValidationError(parsed.error));
    }

    try {
      const result = await generateLessonContentTraced(
        req.user.id,
        roadmapId,
        lessonId,
        parsed.data,
      );
      log.info(
        {
          userId: req.user.id,
          roadmapId,
          lessonId,
          status: result.status,
          durationMs: result.generationDurationMs,
        },
        'Lesson generate handled',
      );

      if (result.status === 'generating') {
        return res.status(409).json(result);
      }
      if (result.status === 'failed') {
        return res.status(500).json(result);
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
);
