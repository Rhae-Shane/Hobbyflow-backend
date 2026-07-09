import rateLimit from 'express-rate-limit';
import { ErrorCodes } from '../lib/AppError';

export const plansRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait a few minutes and try again.',
    code: ErrorCodes.RATE_LIMITED,
  },
});
