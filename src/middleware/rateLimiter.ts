import rateLimit from 'express-rate-limit';

export const plansRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many plan requests. Please try again later.' },
});
