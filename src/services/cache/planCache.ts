import type { Plan } from '../../types/plan.types';
import type { PlanRequest } from '../../schemas/planRequest.schema';
import { env } from '../../config/env';

type CacheEntry = { plan: Plan; expiresAt: number };

const cache = new Map<string, CacheEntry>();

export function getCacheKey(input: PlanRequest): string {
  return [input.hobby, input.level, input.goal ?? '', input.timeBudget].join('|').toLowerCase();
}

export function getCachedPlan(input: PlanRequest): Plan | null {
  const key = getCacheKey(input);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.plan;
}

export function setCachedPlan(input: PlanRequest, plan: Plan): void {
  const key = getCacheKey(input);
  cache.set(key, { plan, expiresAt: Date.now() + env.PLAN_CACHE_TTL_MS });
}

export function clearPlanCache(): void {
  cache.clear();
}
