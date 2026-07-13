export type LessonPlanPromptInput = {
  hobby: string;
  lessonName: string;
  hook: string;
  meaning: string;
  learningGoal?: string;
  backgroundLevel?: string;
  roadmapTitle?: string;
  siblingLessonNames?: string[];
  learnerContext?: string;
  allowVideo: boolean;
  allowAudio: boolean;
  allowImages: boolean;
  repairErrors?: string[];
};

export function buildLessonGenerationSystemPrompt(): string {
  return [
    'You are HobbyFlow lesson author. Write practical, beginner-friendly lesson pages for the stated hobby only.',
    'Return ONLY valid JSON matching the schema. No markdown fences.',
    'Teach by doing with concrete steps, examples, and mistakes to avoid — not vague motivational filler.',
    'Every lesson must feel unique to its title, hook, and meaning. Do not reuse the same outline or wording across lessons.',
    'No emojis. Do not invent URLs.',
    'imageQuery / videoQueries / audioQuery are INTERNAL search hints only — never put them in page markdown.',
    'Page markdown must be teaching content only (no search links, no youtube.com/results URLs).',
    'Every search query MUST start with the hobby name and stay on this lesson topic — never programming, coding, Python, CS, or unrelated hobbies.',
  ].join(' ');
}

export function buildLessonPlanUserPrompt(input: LessonPlanPromptInput): string {
  const siblings =
    input.siblingLessonNames && input.siblingLessonNames.length > 0
      ? input.siblingLessonNames.join(', ')
      : 'none';

  const repair =
    input.repairErrors && input.repairErrors.length > 0
      ? `\nFix these validation errors:\n- ${input.repairErrors.join('\n- ')}\n`
      : '';

  const prefs =
    input.learnerContext?.trim()
      ? `\nLearner prefs (adapt pacing/format; do not invent off-topic content):\n${input.learnerContext.trim()}\n`
      : '';

  return `Create a lesson draft as JSON with this shape:
{
  "pages": [
    { "heading": string, "markdown": string, "imageQuery": string }
  ],
  "videoQueries": [string, string, string],
  "audioQuery": string,
  "keywords": [{ "name": string, "description": string }]
}

Rules:
- 5 to 6 pages (prefer 6 when the topic has enough substance)
- Page 1 heading MUST be exactly "What You Will Learn"
- Page 1 markdown MUST be substantial (at least ~120 words / 8–12 lines). Include:
  1) one short opener tying this lesson to the learner goal
  2) 4–6 markdown bullets of concrete outcomes (skills they can do after), each starting with "* **"bold skill"** — short clause"
  3) one short "why it matters" closer for casual practice
- Pages 2–N headings MUST be lesson-specific (use concepts from "${input.lessonName}" / hook / meaning). Forbidden generic headings: "The Core Idea", "Try It Yourself", "How to Apply It", "Overview", "Introduction", "Summary"
- Suggested page flow after page 1: concept → worked example → common mistakes → guided practice → apply in a short real session
- Each page markdown: 3–5 short paragraphs OR mix of paragraphs + numbered steps. Use **bold** for key terms. Minimum ~60 words per page after page 1.
- Content MUST be about "${input.hobby}" / "${input.lessonName}" only. Answer the hook. Teach the meaning. Do not cover sibling lessons.
- Sibling lessons to AVOID repeating: ${siblings}
- EVERY page MUST include a distinct imageQuery starting with "${input.hobby}" plus a concrete visual (diagram, board position, hand position, equipment close-up). Never reuse the same imageQuery across pages. Prefer encyclopedia/diagram-friendly phrases (e.g. "${input.hobby} ${input.lessonName} diagram", "${input.hobby} labeled illustration"). Required when images allowed: ${input.allowImages}
- videoQueries: exactly 2 or 3 DIFFERENT YouTube search phrases, each starting with "${input.hobby}" (required when video allowed: ${input.allowVideo}). Cover: (1) concept explainer, (2) worked example / demo, (3) short practice drill. Example: ["${input.hobby} ${input.lessonName} explained", "${input.hobby} ${input.lessonName} example demo", "${input.hobby} ${input.lessonName} practice drill"]
- audioQuery: one YouTube search phrase starting with "${input.hobby}" for play-along / podcast / isolated audio (required when audio allowed: ${input.allowAudio})
- Never use queries about programming, software, Python, coding, or other hobbies
- 4 to 6 keywords; descriptions must be specific to this lesson (not "practice" / "consistency" filler)
${repair}${prefs}
Context:
- Hobby: ${input.hobby}
- Roadmap: ${input.roadmapTitle ?? 'n/a'}
- Lesson: ${input.lessonName}
- Hook: ${input.hook}
- Meaning: ${input.meaning}
- Learning goal: ${input.learningGoal ?? 'n/a'}
- Background: ${input.backgroundLevel ?? 'n/a'}
- Sibling lessons: ${siblings}
`;
}
