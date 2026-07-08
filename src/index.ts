import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { plansRouter } from './routes/plans.route';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hobbyflow-server' });
});

app.use('/api/v1/plans', plansRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`HobbyFlow API listening on http://localhost:${env.PORT}`);
});

export default app;
