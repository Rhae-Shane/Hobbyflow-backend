import { nanoid } from 'nanoid';
import type { Plan, Technique } from '../../types/plan.types';
import type { PlanRequest } from '../../schemas/planRequest.schema';

export function buildPlanResponse(
  input: PlanRequest,
  techniques: Technique[],
): Plan {
  const totalMinutes = techniques.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const dailyMinutes = parseDailyMinutes(input.timeBudget);
  const weeks = Math.max(1, Math.round(totalMinutes / dailyMinutes / 7));

  return {
    planId: `pln_${nanoid(8)}`,
    hobby: input.hobby,
    goal: input.goal ?? '',
    level: input.level,
    estimatedDuration: `${weeks} week${weeks === 1 ? '' : 's'}`,
    generatedAt: new Date().toISOString(),
    techniques,
  };
}

function parseDailyMinutes(timeBudget: PlanRequest['timeBudget']): number {
  switch (timeBudget) {
    case '15 min/day':
      return 15;
    case '30 min/day':
      return 30;
    case '1 hr/day':
      return 60;
    default:
      return 30;
  }
}
