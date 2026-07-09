import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { plansRateLimiter } from '../middleware/rateLimiter';
import { planRequestSchema } from '../schemas/planRequest.schema';
import { replaceRequestSchema } from '../schemas/replaceRequest.schema';
import {
  DuplicateTechniqueError,
  generatePlan,
  PlannerUnavailableError,
  replaceTechnique,
} from '../services/planner/plannerService';

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.use(plansRateLimiter);

plansRouter.post('/', async (req, res, next) => {
  const parsed = planRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
  }

  try {
    const plan = await generatePlan(parsed.data);
    return res.status(200).json(plan);
  } catch (error) {
    if (error instanceof PlannerUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    return next(error);
  }
});

plansRouter.post('/replace', async (req, res, next) => {
  const parsed = replaceRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
  }

  try {
    const result = await replaceTechnique(parsed.data);
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
