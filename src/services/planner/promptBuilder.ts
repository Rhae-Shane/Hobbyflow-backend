import type { PlanRequest } from '../../schemas/planRequest.schema';

export function buildRoadmapPrompt(input: PlanRequest): string {
  // TODO: inject modalityRules allowed set per hobby
  return [
    `Generate a 5-8 technique learning roadmap for ${input.hobby}.`,
    `Current skill level: ${input.level}.`,
    `Goal: ${input.goal || 'general improvement'}.`,
    `Daily time budget: ${input.timeBudget}.`,
  ].join('\n');
}
