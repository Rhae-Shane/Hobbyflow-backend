import { Router } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';
import { createChildLogger } from '../lib/logger';
import { toValidationError } from '../lib/validationError';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { dailyTaskDateSchema, generateDailyTaskSchema } from '../schemas/dailyTasks.schema';
import {
  completeDailyTask,
  generateDailyTask,
  getDailyTaskHistory,
  getTodayDailyTasks,
} from '../services/dailyTasks/dailyTaskService';

const log = createChildLogger({ module: 'daily-tasks.route' });

export const dailyTasksRouter = Router();

dailyTasksRouter.use(requireAuth);

dailyTasksRouter.get('/today', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const parsedDate = dailyTaskDateSchema.safeParse(req.query.task_date);
  if (!parsedDate.success) {
    return next(toValidationError(parsedDate.error));
  }

  try {
    const today = await getTodayDailyTasks(req.user.id, parsedDate.data);
    return res.status(200).json(today);
  } catch (error) {
    return next(error);
  }
});

dailyTasksRouter.get('/history', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const todayParsed = dailyTaskDateSchema.safeParse(req.query.task_date ?? req.query.today);
  if (!todayParsed.success) {
    return next(
      new AppError(400, ErrorCodes.VALIDATION_ERROR, 'task_date (today) is required as YYYY-MM-DD'),
    );
  }

  const limit = Number(req.query.limit ?? 30);

  try {
    const history = await getDailyTaskHistory(req.user.id, {
      today: todayParsed.data,
      limit: Number.isFinite(limit) ? limit : 30,
      before: typeof req.query.before === 'string' ? req.query.before : undefined,
    });
    return res.status(200).json(history);
  } catch (error) {
    return next(error);
  }
});

dailyTasksRouter.post('/generate', chatRateLimiter, async (req: AuthenticatedRequest, res, next) => {
  const parsed = generateDailyTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(toValidationError(parsed.error));
  }

  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  try {
    const result = await generateDailyTask(req.user.id, parsed.data.task_date, parsed.data.mode);
    log.info(
      { userId: req.user.id, mode: parsed.data.mode, taskId: result.task.id },
      'Daily task generated',
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

dailyTasksRouter.post('/:id/complete', async (req: AuthenticatedRequest, res, next) => {
  if (!req.user?.id) {
    return next(new AppError(401, ErrorCodes.AUTH_INVALID_SESSION, 'Please sign in to continue'));
  }

  const taskId = String(req.params.id);
  const dateParsed = dailyTaskDateSchema.safeParse(req.body?.task_date ?? req.query.task_date);
  if (!dateParsed.success) {
    return next(
      new AppError(400, ErrorCodes.VALIDATION_ERROR, 'task_date is required as YYYY-MM-DD'),
    );
  }

  try {
    const result = await completeDailyTask(req.user.id, taskId, dateParsed.data);
    log.info(
      { userId: req.user.id, taskId, ratingAwarded: result.ratingAwarded },
      'Daily task completed',
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});
