import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { plansRateLimiter } from '../middleware/rateLimiter';
import { planRequestSchema } from '../schemas/planRequest.schema';
import { replaceRequestSchema } from '../schemas/replaceRequest.schema';
import {
  DuplicateTechniqueError,
  generatePlan,
  InvalidTechniqueIdError,
  PlannerUnavailableError,
  replaceTechnique,
} from '../services/planner/plannerService';

const log = createChildLogger({ module: 'plans.route' });

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.use(plansRateLimiter);

function forwardPlannerError(error: unknown, next: (err: unknown) => void) {
  if (
    error instanceof PlannerUnavailableError ||
    error instanceof DuplicateTechniqueError ||
    error instanceof InvalidTechniqueIdError
  ) {
    next(error);
    return;
  }
  next(error);
}

plansRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  const parsed = planRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const plan = await generatePlan(parsed.data);
    log.info(
      { userId: req.user?.id, hobby: parsed.data.hobby, techniqueCount: plan.techniques.length },
      'Plan generated',
    );
    return res.status(200).json(plan);
  } catch (error) {
    forwardPlannerError(error, next);
  }
});

plansRouter.post('/replace', async (req: AuthenticatedRequest, res, next) => {
  const parsed = replaceRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const result = await replaceTechnique(parsed.data);
    log.info(
      {
        userId: req.user?.id,
        hobby: parsed.data.hobby,
        techniqueId: parsed.data.techniqueId,
      },
      'Technique replaced',
    );
    return res.status(200).json(result);
  } catch (error) {
    forwardPlannerError(error, next);
  }
});
