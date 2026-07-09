import type { ErrorRequestHandler, Request } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCodes } from '../lib/AppError';
import { logger } from '../lib/logger';
import { getRequestId } from './requestLogger';

function resolveClientError(err: unknown): { status: number; code: string; message: string; field?: string } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      field: err.field,
    };
  }

  const status = typeof (err as { status?: number }).status === 'number'
    ? (err as { status: number }).status
    : 500;

  if (status < 500 && err instanceof Error) {
    return {
      status,
      code: ErrorCodes.INTERNAL_ERROR,
      message: err.message,
    };
  }

  return {
    status: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    message:
      env.NODE_ENV === 'production'
        ? 'Something went wrong. Please try again.'
        : err instanceof Error
          ? err.message
          : 'Internal server error',
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = getRequestId(req as Request);
  const { status, code, message, field } = resolveClientError(err);

  logger.error(
    {
      requestId,
      status,
      code,
      err,
      path: req.path,
      method: req.method,
    },
    'Request error',
  );

  res.status(status).json({
    error: message,
    code,
    ...(field ? { field } : {}),
    ...(requestId ? { requestId } : {}),
  });
};
