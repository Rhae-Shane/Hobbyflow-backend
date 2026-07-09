import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { env } from '../config/env';

const loggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'hobbyflow-server', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.cookie',
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
} satisfies pino.LoggerOptions;

// Worker-thread transport drops logs on Windows; use sync pretty stream in dev instead.
const devStream =
  env.NODE_ENV === 'development'
    ? pinoPretty({
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,service,env',
        singleLine: true,
        sync: true,
      })
    : undefined;

export const logger = devStream ? pino(loggerOptions, devStream) : pino(loggerOptions);

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
