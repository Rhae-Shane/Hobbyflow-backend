import { Router } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { leaderboardUserIdsQuerySchema } from '../schemas/leaderboard.schema';
import { resolveLeaderboardUserIds } from '../services/leaderboard/leaderboardService';

export const leaderboardRouter = Router();

leaderboardRouter.use(requireAuth);

/** Resolve user ids matching a category or tag filter (service-role; hobby_tags are RLS-private). */
leaderboardRouter.get('/user-ids', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const parsed = leaderboardUserIdsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  try {
    const q = parsed.data;
    const userIds =
      q.kind === 'category'
        ? await resolveLeaderboardUserIds({ kind: 'category', categoryId: q.categoryId! })
        : await resolveLeaderboardUserIds({
            kind: 'tag',
            hobbyId: q.hobbyId ?? null,
            tagName: q.tagName,
          });

    return res.status(200).json({ userIds });
  } catch (error) {
    return next(error);
  }
});
