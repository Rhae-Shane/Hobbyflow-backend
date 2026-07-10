import express from 'express';
import request from 'supertest';

const mockMaterialize = jest.fn();
const mockGetDetail = jest.fn();
const mockActivate = jest.fn();
const mockMindMap = jest.fn();

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
  materializeRoadmap: (...args: unknown[]) => mockMaterialize(...args),
  getRoadmapDetail: (...args: unknown[]) => mockGetDetail(...args),
  activateRoadmap: (...args: unknown[]) => mockActivate(...args),
}));

jest.mock('../src/services/roadmap/mindmapService', () => ({
  generateOrGetMindMap: (...args: unknown[]) => mockMindMap(...args),
}));

jest.mock('../src/services/roadmap/lessonGenerationService', () => ({
  generateLessonContentTraced: jest.fn(),
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

const validBody = {
  hobby: 'Drums',
  level: 'beginner',
  goalCard: {
    suggestedHobby: 'Drums',
    suggestedName: 'Drumming Foundations for Beginners',
    suggestedGoal: 'Master basic rhythm and limb coordination to play along to favorite songs.',
    suggestedBackground: 'Complete beginner with no prior experience.',
    suggestedLevel: 'beginner',
  },
  lessonPlan: {
    courseTitle: 'Drumming Foundations for Beginners',
    sections: [
      {
        name: 'Rhythm Basics',
        lessons: [
          {
            name: 'Keeping Time',
            hook: 'Can you find the pulse in your favorite song?',
            meaning: 'The beat is the heartbeat of every track you love.',
          },
          {
            name: 'Note Values',
            hook: 'How do short and long sounds create a groove?',
            meaning: 'Understanding timing allows you to read and play patterns.',
          },
        ],
      },
      {
        name: 'Limb Coordination',
        lessons: [
          {
            name: 'Hand Techniques',
            hook: 'What is the secret to holding your sticks comfortably?',
            meaning: 'Proper grip prevents injury and improves your speed.',
          },
        ],
      },
    ],
    stage: 'outline',
    lessonPlanId: '19ea8d96-a62a-4a69-b45e-6fcb3bcdaab4',
  },
  messages: [{ role: 'user', content: 'i want to lear druming' }],
  userRoles: ['Student'],
  isFirstRoadmap: true,
};

describe('roadmaps.route', () => {
  beforeEach(() => {
    mockMaterialize.mockReset();
    mockGetDetail.mockReset();
    mockActivate.mockReset();
    mockMindMap.mockReset();
  });

  it('returns 401 without JWT', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/v1/roadmaps/materialize').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/roadmaps/materialize')
      .set('Authorization', 'Bearer test-token')
      .send({ hobby: 'Drums' });
    expect(res.status).toBe(400);
  });

  it('materializes roadmap and returns 201', async () => {
    mockMaterialize.mockResolvedValue({
      roadmapId: '5a18a5ef-ccd4-491f-b05c-25b133a25575',
      hobbyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'Drumming Foundations for Beginners',
      intro: {
        intro: 'Build a solid rhythmic base from scratch.',
        achievements: '* **Basic limb independence** for steady patterns',
      },
      coverImageUrl: null,
      sections: [
        { id: '11111111-1111-1111-1111-111111111111', name: 'Rhythm Basics', lessonCount: 2 },
      ],
      lessonCount: 3,
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/roadmaps/materialize')
      .set('Authorization', 'Bearer test-token')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.roadmapId).toBe('5a18a5ef-ccd4-491f-b05c-25b133a25575');
    expect(res.body.lessonCount).toBe(3);
    expect(mockMaterialize).toHaveBeenCalledWith('test-user', expect.objectContaining({ hobby: 'Drums' }));
  });

  it('returns roadmap detail', async () => {
    mockGetDetail.mockResolvedValue({
      roadmap: { id: '5a18a5ef-ccd4-491f-b05c-25b133a25575', title: 'Drums' },
      nodes: [],
      lessons: [],
    });

    const app = createTestApp();
    const res = await request(app)
      .get('/api/v1/roadmaps/5a18a5ef-ccd4-491f-b05c-25b133a25575')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.roadmap.title).toBe('Drums');
  });

  it('returns 401 for mindmap without JWT', async () => {
    const app = createTestApp();
    const res = await request(app).post(
      '/api/v1/roadmaps/5a18a5ef-ccd4-491f-b05c-25b133a25575/mindmap',
    );
    expect(res.status).toBe(401);
  });

  it('generates mind map and returns 201', async () => {
    mockMindMap.mockResolvedValue({
      cached: false,
      mindMap: {
        title: 'Drumming Foundations',
        root: {
          id: 'root-0',
          label: 'Drumming Mastery',
          lessonNodeIds: ['5e7d4f8c-e8a7-409c-85b0-90d27bfb9a0f'],
          children: [],
        },
        metadata: {
          version: 'hobbyflow-mind-map-v1',
          createdAt: '2026-07-10T13:06:37.149Z',
          language: 'en',
          roadmapId: '5a18a5ef-ccd4-491f-b05c-25b133a25575',
          roadmapTitle: 'Drumming Foundations for Beginners',
          lessonCount: 1,
          sectionCount: 1,
          practiceCount: 0,
          knowledgeCardCount: 0,
          sourceFingerprint: 'abc',
          personalizationEnabled: true,
        },
      },
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/roadmaps/5a18a5ef-ccd4-491f-b05c-25b133a25575/mindmap')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.mindMap.title).toBe('Drumming Foundations');
    expect(mockMindMap).toHaveBeenCalledWith(
      'test-user',
      '5a18a5ef-ccd4-491f-b05c-25b133a25575',
      {},
    );
  });

  it('returns cached mind map with 200', async () => {
    mockMindMap.mockResolvedValue({
      cached: true,
      mindMap: {
        title: 'Cached',
        root: { id: 'r', label: 'R', lessonNodeIds: [], children: [] },
        metadata: {
          version: 'hobbyflow-mind-map-v1',
          createdAt: '2026-07-10T13:06:37.149Z',
          language: 'en',
          roadmapId: '5a18a5ef-ccd4-491f-b05c-25b133a25575',
          roadmapTitle: 'Cached',
          lessonCount: 0,
          sectionCount: 0,
          practiceCount: 0,
          knowledgeCardCount: 0,
          sourceFingerprint: 'abc',
          personalizationEnabled: true,
        },
      },
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/roadmaps/5a18a5ef-ccd4-491f-b05c-25b133a25575/mindmap')
      .set('Authorization', 'Bearer test-token')
      .send({ force: false });

    expect(res.status).toBe(200);
    expect(res.body.mindMap.title).toBe('Cached');
  });
});
