import type { RequestHandler } from 'express';
import { AppError, ErrorCodes } from '../lib/AppError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, ErrorCodes.NOT_FOUND, 'The requested resource was not found'));
};
