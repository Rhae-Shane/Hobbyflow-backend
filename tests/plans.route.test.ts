import express from 'express';
import request from 'supertest';

const mockGroqGenerateRoadmap = jest.fn();
const mockGroqSuggestReplacement = jest.fn();
const mockGeminiGenerateRoadmap = jest.fn();
const mockGeminiSuggestReplacement = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (
    req: express.Request & { user?: { id: string } },
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }
    req.user = { id: 'test-user' };
    next();
  },
}));

jest.mock('../src/services/provider/groqProvider', () => ({
  createGroqProvider: () => ({
    generateRoadmap: mockGroqGenerateRoadmap,
    suggestReplacement: mockGroqSuggestReplacement,
  }),
}));

jest.mock('../src/services/provider/geminiProvider', () => ({
  createGeminiProvider: () => ({
    generateRoadmap: mockGeminiGenerateRoadmap,
    suggestReplacement: mockGeminiSuggestReplacement,
  }),
}));

import { plansRouter } from '../src/routes/plans.route';
import { clearPlanCache } from '../src/services/cache/planCache';
import {
  DuplicateTechniqueError,
  generatePlan,
  replaceTechnique,
} from '../src/services/planner/plannerService';
import * as plannerService from '../src/services/planner/plannerService';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/plans', plansRouter);
  return app;
}

const validPlan = {
  planId: 'pln_test123',
  hobby: 'Chess',
  goal: 'Learn tactics',
  level: 'beginner' as const,
  estimatedDuration: '2 weeks',
  generatedAt: '2026-07-09T10:00:00Z',
  techniques: [
    {
      id: 't1',
      name: 'Opening principles',
      why: 'Get a playable position.',
      order: 1,
      modality: 'video' as const,
      estimatedMinutes: 20,
      searchQuery: 'chess opening principles',
      status: 'todo' as const,
    },
  ],
};

describe('POST /api/v1/plans', () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    clearPlanCache();
    jest.spyOn(plannerService, 'generatePlan').mockResolvedValue(validPlan);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with a valid plan when authenticated', async () => {
    const response = await request(app)
      .post('/api/v1/plans')
      .set('Authorization', 'Bearer test-token')
      .send({
        hobby: 'Chess',
        level: 'beginner',
        goal: 'Learn tactics',
        timeBudget: '30 min/day',
      });

    expect(response.status).toBe(200);
    expect(response.body.planId).toBe('pln_test123');
    expect(plannerService.generatePlan).toHaveBeenCalledTimes(1);
  });

  it('returns 401 without a JWT', async () => {
    const response = await request(app).post('/api/v1/plans').send({
      hobby: 'Chess',
      level: 'beginner',
      timeBudget: '30 min/day',
    });

    expect(response.status).toBe(401);
    expect(plannerService.generatePlan).not.toHaveBeenCalled();
  });

  it('returns 400 when hobby is missing', async () => {
    const response = await request(app)
      .post('/api/v1/plans')
      .set('Authorization', 'Bearer test-token')
      .send({
        hobby: '',
        level: 'beginner',
        timeBudget: '30 min/day',
      });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('hobby');
    expect(plannerService.generatePlan).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/plans/replace', () => {
  const app = createTestApp();

  beforeEach(() => {
    jest.clearAllMocks();
    clearPlanCache();
    jest.spyOn(plannerService, 'replaceTechnique').mockResolvedValue({
      technique: {
        ...validPlan.techniques[0],
        id: 't2',
        name: 'Knight forks',
        order: 2,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a replacement without requiring a cached plan', async () => {
    const response = await request(app)
      .post('/api/v1/plans/replace')
      .set('Authorization', 'Bearer test-token')
      .send({
        techniqueId: 't2',
        hobby: 'Chess',
        level: 'beginner',
        goal: 'Learn tactics',
        remainingTechniques: ['Opening principles'],
      });

    expect(response.status).toBe(200);
    expect(response.body.technique.name).toBe('Knight forks');
    expect(plannerService.replaceTechnique).toHaveBeenCalledTimes(1);
  });
});

describe('generatePlan fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlanCache();
    mockGroqGenerateRoadmap.mockRejectedValue(new Error('Groq down'));
    mockGeminiGenerateRoadmap.mockRejectedValue(new Error('Gemini down'));
  });

  it('returns a static fallback plan when both providers fail', async () => {
    const plan = await generatePlan({
      hobby: 'chess',
      level: 'beginner',
      goal: '',
      timeBudget: '30 min/day',
    });

    expect(plan.planId).toContain('fallback');
    expect(plan.techniques.length).toBeGreaterThan(0);
  });
});

describe('replaceTechnique duplicate guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlanCache();
    mockGroqSuggestReplacement.mockResolvedValue({
      name: 'Opening principles',
      order: 2,
    });
    mockGeminiSuggestReplacement.mockResolvedValue({
      name: 'Opening principles',
      order: 2,
    });
  });

  it('rejects a replacement that duplicates remaining technique names', async () => {
    await expect(
      replaceTechnique({
        techniqueId: 't2',
        hobby: 'Chess',
        level: 'beginner',
        goal: '',
        remainingTechniques: ['Opening principles'],
      }),
    ).rejects.toBeInstanceOf(DuplicateTechniqueError);
  });
});
