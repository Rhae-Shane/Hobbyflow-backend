import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'hobbyflow-server', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'authorization',
      'password',
      'token',
      'access_token',
      'refresh_token',
      'apiKey',
      '*.apiKey',
    ],
    remove: true,
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
