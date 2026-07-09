import { randomUUID } from 'crypto';
import type { Request } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} — ${err.message}`;
  },
});

export function getRequestId(req: Request): string | undefined {
  const id = req.id;
  if (id === undefined) return undefined;
  return String(id);
}
