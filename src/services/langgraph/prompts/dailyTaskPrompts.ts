export function buildDailyTaskSystemPrompt(): string {
  return [
    'You are HobbyFlow’s daily task coach.',
    'Return ONLY a single JSON object (no markdown fences) with keys:',
    'title (string, 8–120 chars, concrete action for today),',
    'hobby_id (must be one of the provided hobby ids),',
    'task_type ("complete_lesson" | "practice_minutes" | "custom"),',
    'minutes (optional number 5–60, required when task_type is practice_minutes),',
    'rationale (optional short internal note).',
    '',
    'Rules:',
    '- One doable action for today tied to the user’s hobbies and progress.',
    '- Prefer complete_lesson when pending lessons exist for that hobby.',
    '- Prefer practice_minutes for short skill reps when no clear next lesson.',
    '- Use custom for free-form practice when structured types do not fit.',
    '- Avoid repeating recent or discarded titles.',
    '- Do not mention rating, streak, XP, or leaderboards in the title.',
    '- No unsafe, illegal, or medical advice.',
  ].join('\n');
}

export function buildDailyTaskUserPrompt(input: {
  mode: 'primary' | 'regenerate' | 'bonus';
  taskDate: string;
  hobbies: Array<{ id: string; name: string }>;
  recentCompleted: Array<{ title: string; hobbyName?: string | null; taskDate: string }>;
  discardedTitles: string[];
  progress: {
    currentStreak: number;
    rating: number;
    roadmaps: Array<{ title: string; hobbyName?: string | null; pendingLessons: string[] }>;
  };
}): string {
  return JSON.stringify(
    {
      instruction: 'Generate one daily task JSON object for this learner.',
      mode: input.mode,
      taskDate: input.taskDate,
      hobbies: input.hobbies,
      recentCompletedTasks: input.recentCompleted,
      avoidTitles: input.discardedTitles,
      progress: input.progress,
    },
    null,
    2,
  );
}
