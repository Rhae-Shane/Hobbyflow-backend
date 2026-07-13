import express from 'express';
import request from 'supertest';

const mockGenerateLesson = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (
    req: express.Request & { user?: { id: string } },
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Please sign in to continue',
        code: 'AUTH_MISSING_HEADER',
      });
      return;
    }
    req.user = { id: 'test-user' };
    next();
  },
}));

jest.mock('../src/services/roadmap/materializeService', () => ({
  materializeRoadmap: jest.fn(),
  getRoadmapDetail: jest.fn(),
  activateRoadmap: jest.fn(),
}));

jest.mock('../src/services/roadmap/mindmapService', () => ({
  generateOrGetMindMap: jest.fn(),
}));

jest.mock('../src/services/roadmap/lessonGenerationService', () => ({
  generateLessonContentTraced: (...args: unknown[]) => mockGenerateLesson(...args),
}));

import { roadmapsRouter } from '../src/routes/roadmaps.route';
import { errorHandler } from '../src/middleware/errorHandler';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/roadmaps', roadmapsRouter);
  app.use(errorHandler);
  return app;
}

const roadmapId = '5a18a5ef-ccd4-491f-b05c-25b133a25575';
const lessonId = '8ce99834-5a0e-439d-b683-0fd268b843b8';

describe('POST /roadmaps/:id/lessons/:lessonId/generate', () => {
  beforeEach(() => {
    mockGenerateLesson.mockReset();
  });

  it('returns 401 without auth', async () => {
    const app = createTestApp();
    const res = await request(app).post(
      `/api/v1/roadmaps/${roadmapId}/lessons/${lessonId}/generate`,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 on success', async () => {
    mockGenerateLesson.mockResolvedValue({
      status: 'success',
      message: 'Lesson generation completed',
      lessonId,
      nodeId: '5e7d4f8c-e8a7-409c-85b0-90d27bfb9a0f',
      requestGroupId: 'bb269405-782c-417c-a50c-1452b924118a',
      generationDurationMs: 1200,
    });

    const app = createTestApp();
    const res = await request(app)
      .post(`/api/v1/roadmaps/${roadmapId}/lessons/${lessonId}/generate`)
      .set('Authorization', 'Bearer test')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(mockGenerateLesson).toHaveBeenCalledWith('test-user', roadmapId, lessonId, {
      force: false,
      rewriteSession: false,
    });
  });

  it('returns 409 when already generating', async () => {
    mockGenerateLesson.mockResolvedValue({
      status: 'generating',
      lessonId,
      requestGroupId: 'bb269405-782c-417c-a50c-1452b924118a',
    });

    const app = createTestApp();
    const res = await request(app)
      .post(`/api/v1/roadmaps/${roadmapId}/lessons/${lessonId}/generate`)
      .set('Authorization', 'Bearer test')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('generating');
  });

  it('returns 500 payload when generation failed', async () => {
    mockGenerateLesson.mockResolvedValue({
      status: 'failed',
      lessonId,
      error: { code: 'LESSON_GENERATION_FAILED', message: 'boom' },
    });

    const app = createTestApp();
    const res = await request(app)
      .post(`/api/v1/roadmaps/${roadmapId}/lessons/${lessonId}/generate`)
      .set('Authorization', 'Bearer test')
      .send({ force: true });

    expect(res.status).toBe(500);
    expect(res.body.status).toBe('failed');
    expect(mockGenerateLesson).toHaveBeenCalledWith('test-user', roadmapId, lessonId, {
      force: true,
      rewriteSession: false,
    });
  });
});
