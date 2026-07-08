import { Router } from 'express';
import { planRequestSchema } from '../schemas/planRequest.schema';
import { replaceRequestSchema } from '../schemas/replaceRequest.schema';
import { requireAuth } from '../middleware/auth';
import { plansRateLimiter } from '../middleware/rateLimiter';

export const plansRouter = Router();

plansRouter.use(requireAuth);
plansRouter.use(plansRateLimiter);

plansRouter.post('/', (req, res) => {
  const parsed = planRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
  }

  // TODO: wire planner pipeline (prompt → AI → validator → normalizer → modality rules)
  return res.status(501).json({
    error: 'Plan generation not implemented yet',
    received: parsed.data,
  });
});

plansRouter.post('/replace', (req, res) => {
  const parsed = replaceRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: issue?.message ?? 'Invalid request',
      field: issue?.path.join('.') ?? undefined,
    });
  }

  // TODO: wire replacement flow
  return res.status(501).json({
    error: 'Technique replacement not implemented yet',
    received: parsed.data,
  });
});
