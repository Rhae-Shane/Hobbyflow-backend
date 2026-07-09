import type { ErrorRequestHandler } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';

export const jsonParseErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    next(new AppError(400, ErrorCodes.INVALID_JSON, 'Request body must be valid JSON'));
    return;
  }
  next(err);
};
