import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import { getAllowedModalities } from './modalityRules';

const ROADMAP_JSON_SHAPE = `{
  "hobby": "string",
  "level": "string",
  "goal": "string",
  "techniques": [
    {
      "name": "string",
      "why": "string",
      "order": 1,
      "modality": "video | article | audio | interactive",
      "search_query": "string",
      "estimated_minutes": 20
    }
  ]
}`;

const TECHNIQUE_JSON_SHAPE = `{
  "name": "string",
  "why": "string",
  "order": 1,
  "modality": "video | article | audio | interactive",
  "search_query": "string",
  "estimated_minutes": 20
}`;

function buildSystemConstraints(hobby: string): string {
  const allowedModalities = getAllowedModalities(hobby).join(', ');

  return [
    'You are a learning roadmap planner. Return only valid JSON — no markdown, no commentary.',
    'Constraints:',
    '- Return between 5 and 8 techniques (inclusive).',
    '- Never include URLs in any field. Use search_query only — never invent links.',
    `- Allowed modalities for this hobby: ${allowedModalities}.`,
    '- No duplicate or near-duplicate techniques in the same roadmap.',
    '- Each technique should build on the previous one — order by dependency, not just importance.',
    '- Prefer practical, applicable skills over pure theory, given the stated goal.',
    '- search_query must be a plain search phrase, not a URL.',
  ].join('\n');
}

export function buildRoadmapSystemPrompt(hobby: string): string {
  return [
    buildSystemConstraints(hobby),
    `Return JSON matching this shape exactly:\n${ROADMAP_JSON_SHAPE}`,
  ].join('\n\n');
}

export function buildRoadmapUserPrompt(input: PlanRequest): string {
  const lines = [
    `Generate a learning roadmap for ${input.hobby}.`,
    `Current skill level: ${input.level}.`,
    `Goal: ${input.goal || 'general improvement'}.`,
    `Daily time budget: ${input.timeBudget}.`,
  ];

  if (input.learnerContext?.trim()) {
    lines.push(
      '',
      'Learner profile — adapt technique choices, modalities, pacing, and search_query to match:',
      input.learnerContext.trim(),
    );
  }

  return lines.join('\n');
}

export function buildRoadmapPrompt(input: PlanRequest): string {
  return `${buildRoadmapSystemPrompt(input.hobby)}\n\n${buildRoadmapUserPrompt(input)}`;
}

export function buildReplaceSystemPrompt(hobby: string): string {
  const allowedModalities = getAllowedModalities(hobby).join(', ');

  return [
    'You are a learning roadmap planner. Return only valid JSON — no markdown, no commentary.',
    'Constraints:',
    '- Return exactly one replacement technique object.',
    '- Never include URLs in any field. Use search_query only — never invent links.',
    `- Allowed modalities for this hobby: ${allowedModalities}.`,
    '- The replacement must not duplicate any technique already in the roadmap.',
    '- Stay at the same difficulty level as the roadmap.',
    '- Prefer a practical, easier alternative that still supports the stated goal.',
    '- search_query must be a plain search phrase, not a URL.',
    `Return JSON matching this shape exactly:\n${TECHNIQUE_JSON_SHAPE}`,
  ].join('\n');
}

export function buildReplaceUserPrompt(input: ReplaceRequest): string {
  return [
    `Replace technique ${input.techniqueId} in a ${input.hobby} roadmap.`,
    `Current skill level: ${input.level}.`,
    `Goal: ${input.goal || 'general improvement'}.`,
    `Remaining techniques in the roadmap (do not duplicate these names): ${input.remainingTechniques.join(', ')}.`,
    'Suggest one easier or more approachable alternative technique.',
  ].join('\n');
}

export function buildReplacePrompt(input: ReplaceRequest): string {
  return `${buildReplaceSystemPrompt(input.hobby)}\n\n${buildReplaceUserPrompt(input)}`;
}
