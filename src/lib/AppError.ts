export const ErrorCodes = {
  AUTH_MISSING_HEADER: 'AUTH_MISSING_HEADER',
  AUTH_MISSING_TOKEN: 'AUTH_MISSING_TOKEN',
  AUTH_INVALID_SESSION: 'AUTH_INVALID_SESSION',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_OAUTH_FAILED: 'AUTH_OAUTH_FAILED',
  AUTH_SERVICE_UNAVAILABLE: 'AUTH_SERVICE_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PLANNER_UNAVAILABLE: 'PLANNER_UNAVAILABLE',
  CHAT_UNAVAILABLE: 'CHAT_UNAVAILABLE',
  DUPLICATE_TECHNIQUE: 'DUPLICATE_TECHNIQUE',
  INVALID_TECHNIQUE_ID: 'INVALID_TECHNIQUE_ID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field?: string;

  constructor(status: number, code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}
