import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { plansRouter } from './routes/plans.route';

const app = express();

app.use(cors());
app.use(requestLogger);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hobbyflow-server' });
});

app.use('/api/v1/plans', plansRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL },
    'HobbyFlow API started',
  );
});

export default app;
