import cors from 'cors';
import elements from 'elements-express';
import express from 'express';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { jsonParseErrorHandler } from './middleware/jsonParseErrorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import { authRouter } from './routes/auth.route';
import { chatRouter } from './routes/chat.route';
import { plansRouter } from './routes/plans.route';

const app = express();

app.use(cors());
app.use(requestLogger);
app.use(express.json());
app.use(jsonParseErrorHandler);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hobbyflow-server' });
});

app.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

app.use(
  '/api/openapi',
  elements({
    apiDescriptionUrl: '/openapi.json',
    title: 'Express API for HobbyFlow',
    layout: 'sidebar',
    router: 'hash',
  }),
);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/plans', plansRouter);
app.use('/api/v1/chat', chatRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL },
    'HobbyFlow API started',
  );
});

export default app;
