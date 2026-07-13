export type ExerciseGenerationPromptContext = {
  mode: 'batch' | 'single_regenerate';
  hobby: { id: string; name: string };
  section: { id: string; name: string };
  lesson: { id: string; name: string; hook: string; meaning: string };
  siblingLessonNames: string[];
  preferences: Record<string, unknown>;
  personalize: Record<string, unknown>;
  existingTitles: string[];
  avoidTitles: string[];
};

export function buildExerciseSystemPrompt(): string {
  return [
    'You are HobbyFlow’s practice coach.',
    'Return ONLY JSON (no markdown fences).',
    '',
    'For batch mode return:',
    '{ "exercises": [ { "title": string, "instructions": string }, ... ] }',
    'with exactly 2 or 3 exercises.',
    '',
    'For single_regenerate mode return:',
    '{ "title": string, "instructions": string }',
    '',
    'Constraints:',
    '- title: 1–80 chars, short label',
    '- instructions: 1–800 chars, concrete check-off-able action',
    '',
    'Rules:',
    '- Exercises must relate ONLY to the selected lesson (name, hook, meaning), not the whole roadmap.',
    '- Shape practice to the hobby (coding → snippets; chess → play N games on chess.com/Lichess;',
    '  guitar → technique drills; football → skill drills; drawing → timed studies).',
    '- Respect accessibility, practice environment, budget, and learning styles when provided.',
    '- Prefer doable actions with tools/space the learner likely has.',
    '- Avoid repeating existing or avoidTitles.',
    '- Do not mention rating, streak, XP, or leaderboards.',
    '- No unsafe, illegal, or medical advice.',
  ].join('\n');
}

export function buildExerciseUserPrompt(input: ExerciseGenerationPromptContext): string {
  return JSON.stringify(
    {
      instruction:
        input.mode === 'batch'
          ? 'Generate 2–3 practice exercises JSON for this lesson only.'
          : 'Generate one replacement practice exercise JSON for this lesson.',
      mode: input.mode,
      hobby: input.hobby,
      section: input.section,
      lesson: input.lesson,
      siblingLessonNames: input.siblingLessonNames,
      preferences: input.preferences,
      personalize: input.personalize,
      existingTitles: input.existingTitles,
      avoidTitles: input.avoidTitles,
    },
    null,
    2,
  );
}
