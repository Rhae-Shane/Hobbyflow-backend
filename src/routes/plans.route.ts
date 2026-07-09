import { Router } from 'express';
import { createChildLogger } from '../lib/logger';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { plansRateLimiter } from '../middleware/rateLimiter';
import { planRequestSchema } from '../schemas/planRequest.schema';
import { replaceRequestSchema } from '../schemas/replaceRequest.schema';
import {
  DuplicateTechniqueError,
  generatePlan,
  PlannerUnavailableError,
  replaceTechnique,
} from '../services/planner/plannerService';

const log = createChildLogger({ module: 'plans.route' });

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.use(plansRateLimiter);

plansRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  const parsed = planRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    log.warn({ path: '/api/v1/plans', field: issue?.path.join('.') }, 'Invalid plan request');
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
  }

  try {
    const plan = await generatePlan(parsed.data);
    log.info(
      { userId: req.user?.id, hobby: parsed.data.hobby, techniqueCount: plan.techniques.length },
      'Plan generated',
    );
    return res.status(200).json(plan);
  } catch (error) {
    if (error instanceof PlannerUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    return next(error);
  }
});

plansRouter.post('/replace', async (req: AuthenticatedRequest, res, next) => {
  const parsed = replaceRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    log.warn(
      { path: '/api/v1/plans/replace', field: issue?.path.join('.') },
      'Invalid replace request',
    );
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
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
    if (error instanceof DuplicateTechniqueError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof PlannerUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    return next(error);
  }
});
