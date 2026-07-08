import type { Plan } from '../../types/plan.types';
import type { PlanRequest } from '../../schemas/planRequest.schema';

export function getFallbackPlan(input: PlanRequest): Plan | null {
  const key = input.hobby.trim().toLowerCase();
  const template = FALLBACK_PLANS[key];
  if (!template) return null;

  return {
    ...template,
    planId: `pln_fallback_${key}`,
    hobby: input.hobby,
    goal: input.goal ?? '',
    level: input.level,
    generatedAt: new Date().toISOString(),
  };
}

const FALLBACK_PLANS: Record<string, Omit<Plan, 'planId' | 'hobby' | 'goal' | 'level' | 'generatedAt'>> = {
  chess: {
    estimatedDuration: '2 weeks',
    techniques: [
      {
        id: 't1',
        name: 'Opening principles',
        why: 'Get a playable position without memorizing long lines.',
        order: 1,
        modality: 'video',
        estimatedMinutes: 20,
        searchQuery: 'GothamChess opening principles beginner',
        status: 'todo',
      },
      {
        id: 't2',
        name: 'Basic tactics — forks',
        why: 'Win material by attacking two pieces at once.',
        order: 2,
        modality: 'interactive',
        estimatedMinutes: 15,
        searchQuery: 'lichess chess fork puzzles beginner',
        status: 'todo',
      },
    ],
  },
  guitar: {
    estimatedDuration: '3 weeks',
    techniques: [
      {
        id: 't1',
        name: 'Open chords (G, C, D)',
        why: 'Play hundreds of songs with three shapes.',
        order: 1,
        modality: 'video',
        estimatedMinutes: 25,
        searchQuery: 'Justin Guitar open chords beginner',
        status: 'todo',
      },
    ],
  },
  poker: {
    estimatedDuration: '2 weeks',
    techniques: [
      {
        id: 't1',
        name: 'Starting hand selection',
        why: 'Avoid the most common beginner leak — playing too many hands.',
        order: 1,
        modality: 'article',
        estimatedMinutes: 20,
        searchQuery: 'poker starting hands chart beginner',
        status: 'todo',
      },
    ],
  },
};
