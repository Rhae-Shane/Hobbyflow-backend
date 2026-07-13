import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import { parseAccessibilityConstraints } from './learnerAccessibility';
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

function buildSystemConstraints(hobby: string, learnerContext?: string): string {
  const allowedModalities = getAllowedModalities(hobby, learnerContext).join(', ');
  const accessibilityConstraints = parseAccessibilityConstraints(learnerContext);
  const accessibilityLines = accessibilityConstraints?.promptLines ?? [];
  const hasApprovedOutline = Boolean(
    learnerContext?.includes('APPROVED ROADMAP OUTLINE') ||
      learnerContext?.includes('Approved lesson plan outline'),
  );

  return [
    'You are HobbyFlow\'s learning roadmap planner. Return only valid JSON — no markdown, no commentary.',
    'Product principles:',
    '- Users want a focused path of 5–8 techniques toward a chosen level — not mastery of every skill.',
    '- Match modality to the hobby and learner prefs (e.g. demos for guitar, practice drills for chess) — never force mismatched formats like MCQ-as-teaching, audio-only chess, or reading-only guitar.',
    '- Curate a check-off-able practice list; avoid information-overload curricula.',
    'Constraints:',
    '- Return between 5 and 8 techniques (inclusive).',
    '- Never include URLs in any field. Use search_query only — never invent links.',
    `- Allowed modalities for this hobby: ${allowedModalities}.`,
    ...accessibilityLines,
    '- No duplicate or near-duplicate techniques in the same roadmap.',
    '- Each technique should build on the previous one — order by dependency, not just importance.',
    '- Prefer practical, applicable skills over pure theory, given the stated goal.',
    '- search_query must be a plain search phrase, not a URL.',
    ...(hasApprovedOutline
      ? [
          '- CRITICAL: An approved roadmap outline is provided in learner context. Follow it as the learning path.',
          '- Map techniques to outline lessons (names/order). Do not invent an unrelated curriculum.',
          '- Cover the outline progression; if there are more lessons than 8 techniques, merge closely related lessons.',
        ]
      : []),
  ].join('\n');
}

export function buildRoadmapSystemPrompt(hobby: string, learnerContext?: string): string {
  return [
    buildSystemConstraints(hobby, learnerContext),
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
      'Learner profile + approved outline — adapt technique choices, modalities, pacing, and search_query to match.',
      'If an APPROVED ROADMAP OUTLINE is present, that outline IS the learning path: techniques must follow it.',
      input.learnerContext.trim(),
    );
  }

  return lines.join('\n');
}

export function buildRoadmapPrompt(input: PlanRequest): string {
  return `${buildRoadmapSystemPrompt(input.hobby, input.learnerContext)}\n\n${buildRoadmapUserPrompt(input)}`;
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
