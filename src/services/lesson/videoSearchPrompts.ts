export type VideoJudgeSelect = {
  decision: 'select';
  videoId: string;
};

export type VideoJudgeReject = {
  decision: 'reject';
  reason: string;
  nextQuery: string;
};

export type VideoJudgeDecision = VideoJudgeSelect | VideoJudgeReject;

export type VideoJudgePromptInput = {
  hobby: string;
  lessonName: string;
  kind: 'video' | 'audio';
  searchQuery: string;
  candidates: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    description: string;
  }>;
  attempt: number;
  maxAttempts: number;
};

export function buildVideoJudgeSystemPrompt(): string {
  return [
    'You pick one YouTube result for a HobbyFlow lesson, or reject all and suggest a better search query.',
    'Return ONLY valid JSON. No markdown fences.',
    'Select only if the video clearly teaches the stated hobby and lesson.',
    'Reject programming, coding, Python, CS, software, or any unrelated hobby.',
    'For kind=audio prefer listen-along, podcast, play-along, metronome, or guided audio — still on hobby.',
    'nextQuery must stay specific to the hobby + lesson skill and must include the hobby name.',
  ].join(' ');
}

export function buildVideoJudgeUserPrompt(input: VideoJudgePromptInput): string {
  const candidateBlock =
    input.candidates.length === 0
      ? '(no candidates — reject and propose a better nextQuery)'
      : input.candidates
          .map(
            (c, i) =>
              `${i + 1}. id=${c.videoId} | title=${c.title} | channel=${c.channelTitle} | desc=${c.description}`,
          )
          .join('\n');

  return `Pick a video for this lesson or reject and refine the search.

Hobby: ${input.hobby || 'unknown'}
Lesson: ${input.lessonName || 'unknown'}
Kind: ${input.kind}
Current search query: ${input.searchQuery}
Attempt: ${input.attempt}/${input.maxAttempts}

Candidates:
${candidateBlock}

Respond with exactly one of:
{"decision":"select","videoId":"<id from candidates>"}
{"decision":"reject","reason":"<short>","nextQuery":"<improved YouTube search phrase including hobby>"}
`;
}

export function buildEmptyResultsRefinePrompt(input: {
  hobby: string;
  lessonName: string;
  kind: 'video' | 'audio';
  searchQuery: string;
  attempt: number;
  maxAttempts: number;
}): string {
  return `No YouTube candidates were found for this query. Propose a better nextQuery.

Hobby: ${input.hobby || 'unknown'}
Lesson: ${input.lessonName || 'unknown'}
Kind: ${input.kind}
Failed search query: ${input.searchQuery}
Attempt: ${input.attempt}/${input.maxAttempts}

Respond with:
{"decision":"reject","reason":"no results","nextQuery":"<improved YouTube search phrase including hobby>"}
`;
}
