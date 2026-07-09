import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import type { Plan, Technique } from '../../types/plan.types';
import { createChildLogger } from '../../lib/logger';
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

const log = createChildLogger({ module: 'planner' });

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
    log.warn({ err: groqError }, 'Groq failed, trying Gemini immediately');
    try {
      return await operation(geminiProvider);
    } catch (geminiError) {
      log.error({ err: geminiError }, 'Both AI providers failed');
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
    log.debug({ cacheKey: getCacheKey(input) }, 'Plan cache hit');
    return cached;
  }

  log.info({ cacheKey: getCacheKey(input), hobby: input.hobby }, 'Plan cache miss');

  const raw = await callProviders((provider) => provider.generateRoadmap(input));

  if (!raw) {
    const fallback = getFallbackPlan(input);
    if (!fallback) {
      throw new PlannerUnavailableError(
        'Plan generation is temporarily unavailable for this hobby',
      );
    }
    log.warn({ hobby: input.hobby }, 'Serving static fallback plan');
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
      log.warn({ techniqueId: input.techniqueId, hobby: input.hobby }, 'Duplicate replacement, retrying once');
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
