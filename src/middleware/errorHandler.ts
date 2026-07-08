import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';

  if (env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
