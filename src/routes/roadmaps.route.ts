import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { chatRateLimiter, plansRateLimiter } from '../middleware/rateLimiter';
import { materializeRoadmapRequestSchema } from '../schemas/roadmapMaterialize.schema';
import { generateMindMapRequestSchema } from '../schemas/roadmapMindMap.schema';
import { generateLessonRequestSchema, regenerateSectionRequestSchema } from '../schemas/lessonContent.schema';
import {
  completeExerciseBodySchema,
  generateExercisesBodySchema,
  listExercisesQuerySchema,
} from '../schemas/exercises.schema';
import { AppError, ErrorCodes } from '../lib/AppError';
import {
  activateRoadmap,
  getRoadmapDetail,
  materializeRoadmap,
} from '../services/roadmap/materializeService';
import { generateOrGetMindMap } from '../services/roadmap/mindmapService';
import { generateLessonContentTraced } from '../services/roadmap/lessonGenerationService';
import { regenerateSectionOutline } from '../services/roadmap/lessonRewriteService';
import {
  completeExercise,
  generateExercisesForLesson,
  incompleteExercise,
  listExercises,
  regenerateExercise,
} from '../services/roadmap/exerciseService';

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

roadmapsRouter.get('/:id/exercises', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!roadmapId) {
    return next(new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id is required'));
  }

  const parsed = listExercisesQuerySchema.safeParse({
    lessonId: typeof req.query.lessonId === 'string' ? req.query.lessonId : undefined,
    sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
  });
  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const result = await listExercises(req.user.id, roadmapId, parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

roadmapsRouter.post(
  '/:id/lessons/:lessonId/exercises/generate',
  chatRateLimiter,
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

    const parsed = generateExercisesBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(toValidationError(parsed.error));
    }

    try {
      const result = await generateExercisesForLesson(req.user.id, roadmapId, lessonId);
      log.info(
        {
          userId: req.user.id,
          roadmapId,
          lessonId,
          count: result.exercises.length,
        },
        'Exercises generate handled',
      );
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

roadmapsRouter.post(
  '/:id/exercises/:exerciseId/complete',
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.id) {
      return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
    }

    const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    const exerciseId =
      typeof req.params.exerciseId === 'string'
        ? req.params.exerciseId
        : req.params.exerciseId?.[0];

    if (!roadmapId || !exerciseId) {
      return next(
        new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id and exercise id are required'),
      );
    }

    const parsed = completeExerciseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(toValidationError(parsed.error));
    }

    try {
      const result = await completeExercise(
        req.user.id,
        roadmapId,
        exerciseId,
        parsed.data.local_date,
      );
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

roadmapsRouter.post(
  '/:id/exercises/:exerciseId/incomplete',
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.id) {
      return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
    }

    const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    const exerciseId =
      typeof req.params.exerciseId === 'string'
        ? req.params.exerciseId
        : req.params.exerciseId?.[0];

    if (!roadmapId || !exerciseId) {
      return next(
        new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id and exercise id are required'),
      );
    }

    try {
      const result = await incompleteExercise(req.user.id, roadmapId, exerciseId);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

roadmapsRouter.post(
  '/:id/exercises/:exerciseId/regenerate',
  chatRateLimiter,
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.id) {
      return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
    }

    const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    const exerciseId =
      typeof req.params.exerciseId === 'string'
        ? req.params.exerciseId
        : req.params.exerciseId?.[0];

    if (!roadmapId || !exerciseId) {
      return next(
        new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id and exercise id are required'),
      );
    }

    try {
      const result = await regenerateExercise(req.user.id, roadmapId, exerciseId);
      log.info({ userId: req.user.id, roadmapId, exerciseId }, 'Exercise regenerate handled');
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

roadmapsRouter.post(
  '/:id/sections/:sectionId/regenerate',
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.id) {
      return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
    }

    const roadmapId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    const sectionId =
      typeof req.params.sectionId === 'string' ? req.params.sectionId : req.params.sectionId?.[0];

    if (!roadmapId || !sectionId) {
      return next(
        new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap id and section id are required'),
      );
    }

    const parsed = regenerateSectionRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(toValidationError(parsed.error));
    }

    try {
      const outline = await regenerateSectionOutline({
        userId: req.user.id,
        roadmapId,
        sectionId,
      });

      const contentResults: Array<{
        lessonId: string;
        status: 'success' | 'generating' | 'failed' | 'skipped';
        message?: string;
      }> = [];

      if (parsed.data.regenerateContent) {
        for (const lessonId of outline.lessonIds) {
          try {
            const result = await generateLessonContentTraced(req.user.id, roadmapId, lessonId, {
              force: true,
            });
            contentResults.push({
              lessonId,
              status: result.status,
              message: result.message,
            });
          } catch (error) {
            contentResults.push({
              lessonId,
              status: 'failed',
              message: error instanceof Error ? error.message : 'Lesson regenerate failed',
            });
          }
        }
      }

      log.info(
        {
          userId: req.user.id,
          roadmapId,
          sectionId,
          lessonCount: outline.lessonIds.length,
          regenerateContent: parsed.data.regenerateContent,
        },
        'Section regenerate handled',
      );

      return res.status(200).json({
        ...outline,
        contentResults: parsed.data.regenerateContent ? contentResults : undefined,
      });
    } catch (error) {
      return next(error);
    }
  },
);
