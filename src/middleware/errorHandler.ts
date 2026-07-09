import type { ErrorRequestHandler, Request } from 'express';
import { logger } from '../lib/logger';
import { getRequestId } from './requestLogger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  const requestId = getRequestId(req as Request);

  logger.error(
    {
      requestId,
      status,
      err,
      path: req.path,
      method: req.method,
    },
    'Unhandled request error',
  );

  res.status(status).json({
    error: message,
    ...(requestId ? { requestId } : {}),
  });
};
