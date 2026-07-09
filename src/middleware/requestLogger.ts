import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Request } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

const QUIET_PATHS = new Set(['/', '/health', '/openapi.json']);

function requestPath(req: IncomingMessage): string {
  const url = req.url ?? '';
  return url.split('?')[0] ?? url;
}

function shouldSkipRequestLog(req: IncomingMessage): boolean {
  return req.method === 'GET' && QUIET_PATHS.has(requestPath(req));
}

function serializeRequest(req: IncomingMessage) {
  const expressReq = req as Request;
  return {
    id: expressReq.id,
    method: req.method,
    path: requestPath(req),
  };
}

function serializeResponse(res: ServerResponse) {
  return { statusCode: res.statusCode };
}

export const requestLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  quietResLogger: true,
  serializers: {
    req: serializeRequest,
    res: serializeResponse,
  },
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: {
    ignore: shouldSkipRequestLog,
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${requestPath(req)} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${requestPath(req)} ${res.statusCode} — ${err.message}`;
  },
  customSuccessObject: (req, res, val) => ({
    requestId: (req as Request).id,
    method: req.method,
    path: requestPath(req),
    status: res.statusCode,
    responseTime: val.responseTime,
  }),
  customErrorObject: (req, res, err, val) => ({
    requestId: (req as Request).id,
    method: req.method,
    path: requestPath(req),
    status: res.statusCode,
    responseTime: val.responseTime,
    err,
  }),
});

export function getRequestId(req: Request): string | undefined {
  const id = req.id;
  if (id === undefined) return undefined;
  return String(id);
}
