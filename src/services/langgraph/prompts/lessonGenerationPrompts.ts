export type LessonPlanPromptInput = {
  hobby: string;
  lessonName: string;
  hook: string;
  meaning: string;
  learningGoal?: string;
  backgroundLevel?: string;
  roadmapTitle?: string;
  siblingLessonNames?: string[];
  allowVideo: boolean;
  allowAudio: boolean;
  allowImages: boolean;
  repairErrors?: string[];
};

export function buildLessonGenerationSystemPrompt(): string {
  return [
    'You are HobbyFlow lesson author. Write practical, beginner-friendly lesson pages.',
    'Return ONLY valid JSON matching the schema. No markdown fences.',
    'Teach by doing. Short paragraphs. No emojis. Do not invent URLs.',
    'imageQuery / videoQuery / audioQuery are INTERNAL search hints only — never put them in page markdown.',
    'Page markdown must be teaching content only (no search links, no youtube.com/results URLs).',
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

  return `Create a lesson draft as JSON with this shape:
{
  "pages": [
    { "heading": string, "markdown": string, "imageQuery": string }
  ],
  "videoQuery": string,
  "audioQuery": string,
  "keywords": [{ "name": string, "description": string }]
}

Rules:
- 4 to 6 pages
- First page heading should be like "What You Will Learn"
- markdown: 2-4 short paragraphs, use **bold** for key terms
- imageQuery: concrete visual search phrase for that page (required when images allowed: ${input.allowImages})
- videoQuery: one YouTube search phrase for a teaching video (required when video allowed: ${input.allowVideo})
- audioQuery: one YouTube search phrase for play-along / podcast / isolated audio (required when audio allowed: ${input.allowAudio})
- 3 to 5 keywords
${repair}
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
