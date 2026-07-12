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
import { askAnythingRouter } from './routes/askAnything.route';
import { authRouter } from './routes/auth.route';
import { chatRouter } from './routes/chat.route';
import { dailyTasksRouter } from './routes/dailyTasks.route';
import { leaderboardRouter } from './routes/leaderboard.route';
import { plansRouter } from './routes/plans.route';
import { roadmapCreationChatRouter } from './routes/roadmapCreationChat.route';
import { roadmapsRouter } from './routes/roadmaps.route';

const app = express();

// Behind nginx/Caddy — required so express-rate-limit trusts X-Forwarded-For
app.set('trust proxy', 1);

app.use(cors());
app.use(requestLogger);
app.use(express.json());
app.use(jsonParseErrorHandler);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hobbyflow-server',
    gitSha: env.DEPLOY_GIT_SHORT || env.DEPLOY_GIT_SHA || null,
    deployedAt: env.DEPLOYED_AT || null,
  });
});

/** Public ping for mobile clients to verify API base URL / connectivity. */
app.get('/api/v1/ping', (_req, res) => {
  res.json({
    ok: true,
    service: 'hobbyflow-server',
    time: new Date().toISOString(),
  });
});

/** Hit this after deploy to confirm the VM is running the expected commit. */
app.get('/version', (_req, res) => {
  res.json({
    service: 'hobbyflow-server',
    gitSha: env.DEPLOY_GIT_SHA || null,
    gitShort: env.DEPLOY_GIT_SHORT || null,
    deployedAt: env.DEPLOYED_AT || null,
    nodeEnv: env.NODE_ENV,
    pid: process.pid,
  });
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
app.use('/api/v1/roadmap-creation-chat', roadmapCreationChatRouter);
app.use('/api/v1/ask-anything', askAnythingRouter);
app.use('/api/v1/daily-tasks', dailyTasksRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/roadmaps', roadmapsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, '0.0.0.0', () => {
  const langsmithTracing = process.env.LANGSMITH_TRACING === 'true';

  logger.info(
    {
      pid: process.pid,
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      langsmithTracing,
      langsmithProject: langsmithTracing ? process.env.LANGSMITH_PROJECT : undefined,
    },
    'HobbyFlow API started',
  );
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.fatal(
      { port: env.PORT, err: error },
      `Port ${env.PORT} is already in use — run "npm run kill-port" then restart`,
    );
  } else {
    logger.fatal({ err: error }, 'Server failed to start');
  }
  process.exit(1);
});

export default app;
