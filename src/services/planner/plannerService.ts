import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import type { Plan, Technique } from '../../types/plan.types';
import { getCachedPlan, getCacheKey, setCachedPlan } from '../cache/planCache';
import { createGeminiProvider } from '../provider/geminiProvider';
import { createGroqProvider } from '../provider/groqProvider';
import type { AIProvider } from '../provider/aiProvider.interface';
import { getFallbackPlan } from './fallbackPlans';
import { applyModalityRules } from './modalityRules';
import { normalizeTechniques } from './normalizer';
import { buildPlanResponse } from './planResponseBuilder';
import { isDuplicateTechniqueName } from './replacementRules';
import type { RawPlanResponse, RawTechniqueResponse } from './validator';

const groqProvider = createGroqProvider();
const geminiProvider = createGeminiProvider();

export class DuplicateTechniqueError extends Error {
  constructor() {
    super('Replacement technique duplicates an existing roadmap technique');
    this.name = 'DuplicateTechniqueError';
  }
}

export class PlannerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerUnavailableError';
  }
}

async function callProviders<T>(
  operation: (provider: AIProvider) => Promise<T>,
): Promise<T | null> {
  try {
    return await operation(groqProvider);
  } catch (groqError) {
    console.warn('[planner] Groq failed, trying Gemini immediately', groqError);
    try {
      return await operation(geminiProvider);
    } catch (geminiError) {
      console.error('[planner] Both AI providers failed', geminiError);
      return null;
    }
  }
}

function processTechniques(hobby: string, raw: RawPlanResponse): Technique[] {
  const normalized = normalizeTechniques(raw, hobby);
  return applyModalityRules(hobby, normalized) as Technique[];
}

function processSingleTechnique(
  hobby: string,
  raw: RawTechniqueResponse,
  order: number,
): Technique {
  const wrapped: RawPlanResponse = {
    techniques: [{ ...raw, order }],
  };
  const [technique] = processTechniques(hobby, wrapped);
  return technique;
}

function parseTechniqueOrder(techniqueId: string): number {
  const match = /^t(\d+)$/i.exec(techniqueId.trim());
  if (!match) {
    throw new Error(`Invalid techniqueId: ${techniqueId}`);
  }
  return Number.parseInt(match[1], 10);
}

export async function generatePlan(input: PlanRequest): Promise<Plan> {
  const cached = getCachedPlan(input);
  if (cached) {
    console.log('[planCache] HIT', getCacheKey(input));
    return cached;
  }

  console.log('[planCache] MISS', getCacheKey(input));

  const raw = await callProviders((provider) => provider.generateRoadmap(input));

  if (!raw) {
    const fallback = getFallbackPlan(input);
    if (!fallback) {
      throw new PlannerUnavailableError(
        'Plan generation is temporarily unavailable for this hobby',
      );
    }
    console.log('[planner] Serving static fallback plan for', input.hobby);
    return fallback;
  }

  const techniques = processTechniques(input.hobby, raw);
  const plan = buildPlanResponse(input, techniques);
  setCachedPlan(input, plan);
  return plan;
}

async function suggestReplacementWithRetry(
  input: ReplaceRequest,
  order: number,
  allowRetry: boolean,
): Promise<Technique> {
  const raw = await callProviders((provider) => provider.suggestReplacement(input));

  if (!raw) {
    throw new PlannerUnavailableError('Technique replacement is temporarily unavailable');
  }

  const technique = processSingleTechnique(input.hobby, raw, order);

  if (isDuplicateTechniqueName(technique.name, input.remainingTechniques)) {
    if (allowRetry) {
      console.warn('[planner] Duplicate replacement detected, retrying once');
      return suggestReplacementWithRetry(input, order, false);
    }
    throw new DuplicateTechniqueError();
  }

  return {
    ...technique,
    id: input.techniqueId,
    order,
  };
}

export async function replaceTechnique(
  input: ReplaceRequest,
): Promise<{ technique: Technique }> {
  const order = parseTechniqueOrder(input.techniqueId);
  const technique = await suggestReplacementWithRetry(input, order, true);
  return { technique };
}
