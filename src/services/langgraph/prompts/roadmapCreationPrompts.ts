import {
  MAX_CLARIFICATION_ROUNDS,
  MIN_CLARIFICATION_ROUNDS,
} from '../../../schemas/roadmapCreationChat.schema';

export type RoadmapCreationPromptContext = {
  userRoles: string[];
  isFirstRoadmap: boolean;
  learnerContextSummary: string;
  clarificationRound: number;
  roadmapName?: string;
  roadmapGoal?: string;
  roadmapBackground?: string;
};

const JSON_RULES = `Respond with valid JSON only — no markdown fences, no commentary.

For clarification turns use:
{
  "type": "clarification",
  "message": "friendly question",
  "quickReplies": [{ "text": "option" }],
  "multiSelect": false,
  "flowState": "clarifying"
}

For goal synthesis / refinement use:
{
  "type": "goal_suggestion",
  "message": "empathetic summary",
  "suggestedHobby": "Guitar",
  "suggestedName": "Short roadmap title",
  "suggestedGoal": "Specific learning goal",
  "suggestedBackground": "Learner background summary",
  "suggestedLevel": "beginner",
  "flowState": "confirming-goal"
}

Rules:
- quickReplies: 2–6 options, hobby-specific, concise
- multiSelect: true when multiple answers make sense (goals, genres, use cases)
- suggestedHobby: canonical hobby name for planning (e.g. "Guitar", "Chess")
- suggestedLevel: beginner | intermediate | advanced
- Personalize questions using user roles when relevant
- Use roadmap/hobby terminology, never "course"`;

export function buildRoadmapCreationSystemPrompt(ctx: RoadmapCreationPromptContext): string {
  const rolesLine =
    ctx.userRoles.length > 0 ? `User roles: ${ctx.userRoles.join(', ')}` : 'User roles: unknown';
  const firstLine = ctx.isFirstRoadmap
    ? 'This is the user\'s first hobby roadmap — use welcoming, encouraging tone.'
    : 'The user is adding another hobby — be concise.';

  const prefsBlock = ctx.learnerContextSummary
    ? `\nSaved preferences:\n${ctx.learnerContextSummary}`
    : '';

  return `You are HobbyFlow's roadmap creation assistant. Help users discover a personalized learning roadmap through brief MCQ-style questions, then propose a goal summary card.

${firstLine}
${rolesLine}
Clarification round: ${ctx.clarificationRound} (ask ${MIN_CLARIFICATION_ROUNDS}–${MAX_CLARIFICATION_ROUNDS} questions total before goal_suggestion)
${prefsBlock}

Question themes (adapt order to hobby — skip irrelevant ones):
1. Current experience / skill level
2. Primary motivation
3. Style, genre, or focus area (if applicable)
4. How they plan to practice or apply the skill

${JSON_RULES}`;
}

export function buildClarificationUserPrompt(ctx: RoadmapCreationPromptContext): string {
  return `Generate the next clarification question (round ${ctx.clarificationRound + 1} of ${MAX_CLARIFICATION_ROUNDS}).
Ask one focused question with 3–6 quick reply chips. Set multiSelect true when multiple answers fit.`;
}

export function buildSynthesizeGoalPrompt(): string {
  return `You have enough context. Generate a goal_suggestion JSON that summarizes a personalized roadmap for this user.
Make suggestedName a compelling title, suggestedGoal actionable, suggestedBackground a concise learner profile.`;
}

export function buildRefineGoalPrompt(ctx: RoadmapCreationPromptContext): string {
  return `The user wants to tweak their roadmap summary. Update the goal_suggestion JSON incorporating their latest message.

Current card:
- Name: ${ctx.roadmapName ?? '(none)'}
- Goal: ${ctx.roadmapGoal ?? '(none)'}
- Background: ${ctx.roadmapBackground ?? '(none)'}`;
}
