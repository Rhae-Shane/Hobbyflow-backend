const mockGroqGenerateRoadmap = jest.fn();
const mockOpenRouterGenerateRoadmap = jest.fn();
const mockAiGatewayGenerateRoadmap = jest.fn();

jest.mock('../src/services/provider/groqProvider', () => ({
  createGroqProvider: () => ({
    generateRoadmap: mockGroqGenerateRoadmap,
    suggestReplacement: jest.fn(),
  }),
}));

jest.mock('../src/services/provider/openrouterProvider', () => ({
  createOpenRouterProvider: () => ({
    generateRoadmap: mockOpenRouterGenerateRoadmap,
    suggestReplacement: jest.fn(),
  }),
}));

jest.mock('../src/services/provider/aiGatewayProvider', () => ({
  createAiGatewayProvider: () => ({
    generateRoadmap: mockAiGatewayGenerateRoadmap,
    suggestReplacement: jest.fn(),
  }),
}));

import type { PlanRequest } from '../src/schemas/planRequest.schema';
import {
  clearPlanCache,
  getCachedPlan,
  getCacheKey,
  setCachedPlan,
} from '../src/services/cache/planCache';
import { generatePlan } from '../src/services/planner/plannerService';
import type { Plan } from '../src/types/plan.types';

const request: PlanRequest = {
  hobby: 'Chess',
  level: 'beginner',
  goal: 'Learn tactics',
  timeBudget: '30 min/day',
};

const rawPlan = {
  techniques: Array.from({ length: 5 }, (_, i) => ({
    name: `Technique ${i + 1}`,
    why: `Why ${i + 1}`,
    order: i + 1,
    modality: 'video' as const,
  })),
};

describe('planCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlanCache();
    mockGroqGenerateRoadmap.mockResolvedValue(rawPlan);
    mockOpenRouterGenerateRoadmap.mockResolvedValue(rawPlan);
    mockAiGatewayGenerateRoadmap.mockResolvedValue(rawPlan);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a cache hit without calling the provider again', async () => {
    await generatePlan(request);
    await generatePlan(request);

    expect(mockGroqGenerateRoadmap).toHaveBeenCalledTimes(1);
    expect(mockOpenRouterGenerateRoadmap).not.toHaveBeenCalled();
    expect(mockAiGatewayGenerateRoadmap).not.toHaveBeenCalled();
  });

  it('expires entries after TTL', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T10:00:00Z'));

    const plan = {
      planId: 'pln_test',
      hobby: 'Chess',
      goal: '',
      level: 'beginner' as const,
      estimatedDuration: '2 weeks',
      generatedAt: '2026-07-09T10:00:00Z',
      techniques: [],
    } satisfies Plan;

    setCachedPlan(request, plan);
    expect(getCachedPlan(request)).toEqual(plan);

    jest.advanceTimersByTime(86_400_001);
    expect(getCachedPlan(request)).toBeNull();
    expect(getCacheKey(request)).toBe('chess|beginner|learn tactics|30 min/day|');
  });
});
