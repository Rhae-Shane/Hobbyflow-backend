import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Capture 100% of transactions in dev; sample in production.
    tracesSampleRate: (process.env.NODE_ENV ?? 'development') === 'production' ? 0.2 : 1.0,
  });
}

export { Sentry };
