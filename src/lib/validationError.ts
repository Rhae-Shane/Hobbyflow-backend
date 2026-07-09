import type { ZodError } from 'zod';
import { AppError, ErrorCodes } from './AppError';

export function toValidationError(zodError: ZodError): AppError {
  const issue = zodError.issues[0];
  const field = issue?.path.join('.') || undefined;
  const message = issue?.message ?? 'Invalid request';
  return new AppError(400, ErrorCodes.VALIDATION_ERROR, message, field);
}
