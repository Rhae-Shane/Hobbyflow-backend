import {
  MAX_CLARIFICATION_ROUNDS,
  MIN_CLARIFICATION_ROUNDS,
  type CurrentLessonPlan,
} from '../../../schemas/roadmapCreationChat.schema';

export type RoadmapCreationPromptContext = {
  userRoles: string[];
  isFirstRoadmap: boolean;
  learnerContextSummary: string;
  clarificationRound: number;
  roadmapName?: string;
  roadmapGoal?: string;
  roadmapBackground?: string;
  currentLessonPlan?: CurrentLessonPlan | null;
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

For lesson plan outline turns use:
{
  "type": "lesson_plan",
  "courseTitle": "Compelling roadmap title",
  "sections": [
    {
      "name": "Section name",
      "lessons": [
        {
          "name": "Lesson name",
          "hook": "Curiosity-sparking question?",
          "meaning": "Why this lesson matters."
        }
      ]
    }
  ],
  "stage": "outline",
  "flowState": "reviewing-outline",
  "message": "Here's a personalized outline based on your goals."
}

Rules:
- quickReplies: 2–6 options, hobby-specific, concise
- multiSelect: true when multiple answers make sense (goals, genres, use cases)
- suggestedHobby: canonical hobby name for planning (e.g. "Guitar", "Chess")
- suggestedLevel: beginner | intermediate | advanced
- lesson_plan: 3–5 sections, 2–3 lessons each; hooks are questions; meanings are one sentence
- Do NOT invent lessonPlanId — the server assigns it
- Personalize using user roles when relevant
- Use roadmap/hobby terminology in message copy, never "course" in user-facing message text`;

export function buildRoadmapCreationSystemPrompt(ctx: RoadmapCreationPromptContext): string {
  const rolesLine =
    ctx.userRoles.length > 0 ? `User roles: ${ctx.userRoles.join(', ')}` : 'User roles: unknown';
  const firstLine = ctx.isFirstRoadmap
    ? 'This is the user\'s first hobby roadmap — use welcoming, encouraging tone.'
    : 'The user is adding another hobby — be concise.';

  const prefsBlock = ctx.learnerContextSummary
    ? `\nSaved preferences:\n${ctx.learnerContextSummary}`
    : '';

  return `You are HobbyFlow's roadmap creation assistant. Help users discover a personalized learning roadmap through brief MCQ-style questions, propose a goal summary card, then generate a lesson-plan outline.

${firstLine}
${rolesLine}
Clarification round: ${ctx.clarificationRound} (ask ${MIN_CLARIFICATION_ROUNDS}–${MAX_CLARIFICATION_ROUNDS} questions total before goal_suggestion)
${prefsBlock}

IMPORTANT personalization rules:
- Use saved preferences (role, age, accessibility/disability needs, practice environment, budget, learning styles) to shape questions and outlines
- Never ask the user to restate accessibility needs already listed in preferences
- Respect accessibility constraints when suggesting practice formats (e.g. no video-only for blindness)
- Tailor tone and examples to their role and schedule constraints

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

function formatCurrentOutline(plan: CurrentLessonPlan): string {
  return JSON.stringify(
    {
      courseTitle: plan.courseTitle,
      sections: plan.sections,
      stage: 'outline',
    },
    null,
    2,
  );
}

export function buildLessonPlanOutlinePrompt(ctx: RoadmapCreationPromptContext): string {
  const goalBlock = `Confirmed goal card:
- Name: ${ctx.roadmapName ?? '(none)'}
- Goal: ${ctx.roadmapGoal ?? '(none)'}
- Background: ${ctx.roadmapBackground ?? '(none)'}`;

  if (ctx.currentLessonPlan?.sections?.length) {
    return `The user wants changes to the EXISTING roadmap outline below. Return an updated lesson_plan JSON.

${goalBlock}

CURRENT OUTLINE (source of truth — edit this; do NOT invent a brand-new unrelated outline):
${formatCurrentOutline(ctx.currentLessonPlan)}

CRITICAL edit rules:
- Apply ONLY the user's latest change request
- Keep sections/lessons the user said are fine UNCHANGED (same names, hooks, meanings)
- Only modify the parts they asked to change (e.g. "change the 3rd section" → keep sections 1–2 identical)
- If they ask to make it shorter/easier/etc., revise while preserving the same hobby focus and goal
- Preserve courseTitle unless they asked to rename it
- Include a short friendly message summarizing what you changed
- Set flowState to "reviewing-outline"
- Do not include lessonPlanId`;
  }

  return `The user confirmed their roadmap goal. Generate a NEW lesson_plan outline JSON (stage: "outline").

${goalBlock}

Requirements:
- courseTitle should match or refine the confirmed name
- 3–5 progressive sections from basics → applied practice
- 2–3 lessons per section
- Each lesson needs name, hook (question), meaning (one sentence why it matters)
- Personalize to the confirmed goal and background
- Include a short friendly message field summarizing the outline
- Set flowState to "reviewing-outline"
- Do not include lessonPlanId`;
}
