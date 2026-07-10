import express from 'express';
import request from 'supertest';

const mockInvoke = jest.fn();

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

jest.mock('../src/services/langgraph/roadmapCreationChatService', () => ({
  invokeRoadmapCreationChatSafe: (...args: unknown[]) => mockInvoke(...args),
  RoadmapCreationUnavailableError: class RoadmapCreationUnavailableError extends Error {
    name = 'RoadmapCreationUnavailableError';
  },
}));

import { roadmapCreationChatRouter } from '../src/routes/roadmapCreationChat.route';
import { errorHandler } from '../src/middleware/errorHandler';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/roadmap-creation-chat', roadmapCreationChatRouter);
  app.use(errorHandler);
  return app;
}

const validClarification = {
  type: 'clarification',
  message: "That's a great choice! What is your current experience level?",
  quickReplies: [
    { text: 'Complete beginner (never held one)' },
    { text: 'Know a few basic chords' },
  ],
  multiSelect: false,
  flowState: 'clarifying',
};

describe('roadmapCreationChat.route', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('returns 401 without JWT', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/v1/roadmap-creation-chat').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/roadmap-creation-chat')
      .set('Authorization', 'Bearer test-token')
      .send({ message: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns clarification response', async () => {
    mockInvoke.mockResolvedValue(validClarification);
    const app = createTestApp();

    const res = await request(app)
      .post('/api/v1/roadmap-creation-chat')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'i want to learn guitar',
        messages: [{ role: 'user', content: 'i want to learn guitar' }],
        flowState: 'collecting-input',
        userRoles: ['Student'],
        isFirstRoadmap: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('clarification');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ userRoles: ['Student'] }),
      expect.objectContaining({ userId: 'test-user' }),
    );
  });
});
