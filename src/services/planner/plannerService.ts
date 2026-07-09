import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import type { Plan, Technique, Modality } from '../../types/plan.types';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { getCachedPlan, getCacheKey, setCachedPlan } from '../cache/planCache';
import { createGeminiProvider } from '../provider/geminiProvider';
import { createGroqProvider } from '../provider/groqProvider';
import type { AIProvider } from '../provider/aiProvider.interface';
import { getFallbackPlan } from './fallbackPlans';
import {
  buildAccessibilityRetryHint,
  parseAccessibilityConstraints,
  rawPlanViolatesAccessibility,
} from './learnerAccessibility';
import { applyModalityRules } from './modalityRules';
import { normalizeTechniques } from './normalizer';
import { buildPlanResponse } from './planResponseBuilder';
import { isDuplicateTechniqueName } from './replacementRules';
import type { RawPlanResponse, RawTechniqueResponse } from './validator';

const log = createChildLogger({ module: 'planner' });

const groqProvider = createGroqProvider();
const geminiProvider = createGeminiProvider();

export class DuplicateTechniqueError extends AppError {
  constructor() {
    super(
      409,
      ErrorCodes.DUPLICATE_TECHNIQUE,
      "Couldn't find a unique replacement — keep your current technique",
    );
    this.name = 'DuplicateTechniqueError';
  }
}

export class PlannerUnavailableError extends AppError {
  constructor(message = 'Plan generation is temporarily unavailable. Please try again.') {
    super(503, ErrorCodes.PLANNER_UNAVAILABLE, message);
    this.name = 'PlannerUnavailableError';
  }
}

export class InvalidTechniqueIdError extends AppError {
  constructor() {
    super(400, ErrorCodes.INVALID_TECHNIQUE_ID, 'Invalid technique selected');
    this.name = 'InvalidTechniqueIdError';
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

function processTechniques(
  hobby: string,
  raw: RawPlanResponse,
  learnerContext?: string,
): Technique[] {
  const normalized = normalizeTechniques(raw, hobby);
  return applyModalityRules(
    hobby,
    normalized as Array<{ modality: Modality; searchQuery: string } & Omit<Technique, 'modality' | 'searchQuery'>>,
    learnerContext,
  ) as Technique[];
}

function processSingleTechnique(
  hobby: string,
  raw: RawTechniqueResponse,
  order: number,
): Technique {
  const wrapped: RawPlanResponse = {
    techniques: [{ ...raw, order }],
  };
  const [technique] = processTechniques(hobby, wrapped, undefined);
  return technique;
}

function parseTechniqueOrder(techniqueId: string): number {
  const match = /^t(\d+)$/i.exec(techniqueId.trim());
  if (!match) {
    throw new InvalidTechniqueIdError();
  }
  return Number.parseInt(match[1], 10);
}

async function generatePlanFromProviders(
  input: PlanRequest,
  allowAccessibilityRetry: boolean,
): Promise<Plan | null> {
  const raw = await callProviders((provider) => provider.generateRoadmap(input));

  if (!raw) {
    return null;
  }

  const accessibilityConstraints = parseAccessibilityConstraints(input.learnerContext);

  if (
    accessibilityConstraints &&
    rawPlanViolatesAccessibility(raw.techniques, accessibilityConstraints) &&
    allowAccessibilityRetry
  ) {
    log.warn(
      { hobby: input.hobby, forbidden: accessibilityConstraints.forbiddenModalities },
      'Roadmap violated accessibility constraints, retrying once',
    );

    const retryInput: PlanRequest = {
      ...input,
      learnerContext: [input.learnerContext?.trim(), buildAccessibilityRetryHint(accessibilityConstraints)]
        .filter(Boolean)
        .join('\n\n'),
    };

    return generatePlanFromProviders(retryInput, false);
  }

  const techniques = processTechniques(input.hobby, raw, input.learnerContext);
  return buildPlanResponse(input, techniques);
}

export async function generatePlan(input: PlanRequest): Promise<Plan> {
  const cached = getCachedPlan(input);
  if (cached) {
    log.debug({ cacheKey: getCacheKey(input) }, 'Plan cache hit');
    return cached;
  }

  log.info({ cacheKey: getCacheKey(input), hobby: input.hobby }, 'Plan cache miss');

  const plan = await generatePlanFromProviders(input, true);

  if (!plan) {
    const fallback = getFallbackPlan(input);
    if (!fallback) {
      throw new PlannerUnavailableError(
        'Plan generation is temporarily unavailable for this hobby. Try again or use a starter plan.',
      );
    }
    log.warn({ hobby: input.hobby }, 'Serving static fallback plan');
    return fallback;
  }

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
    throw new PlannerUnavailableError(
      "Couldn't find a replacement right now. Please try again.",
    );
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
