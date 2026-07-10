import {
  clarificationResponseSchema,
  formatClarificationAnswer,
  goalSuggestionResponseSchema,
  MAX_CLARIFICATION_ROUNDS,
  MIN_CLARIFICATION_ROUNDS,
  roadmapCreationChatRequestSchema,
  roadmapCreationChatResponseSchema,
} from '../src/schemas/roadmapCreationChat.schema';

describe('roadmapCreationChat.schema', () => {
  const guitarClarificationQ1 = {
    type: 'clarification' as const,
    message: "That's a great choice! What is your current experience level with the guitar?",
    quickReplies: [
      { text: 'Complete beginner (never held one)' },
      { text: 'Know a few basic chords' },
      { text: 'Self-taught but need structure' },
      { text: 'Played other instruments before' },
    ],
    multiSelect: false,
    flowState: 'clarifying' as const,
  };

  const guitarGoalSuggestion = {
    type: 'goal_suggestion' as const,
    message:
      "I've put together a plan to help you go from a complete beginner to recording your own original rock and indie tracks.",
    suggestedHobby: 'Guitar',
    suggestedName: 'Indie Rock Songwriting & Recording',
    suggestedGoal:
      'Learn fundamental guitar techniques to write, record, and share original rock and indie songs from your home studio.',
    suggestedBackground:
      'Complete beginner with no prior guitar experience, interested in songwriting and home recording.',
    suggestedLevel: 'beginner' as const,
    flowState: 'confirming-goal' as const,
  };

  it('parses Inspo-style clarification response (guitar Q1)', () => {
    const result = clarificationResponseSchema.parse(guitarClarificationQ1);
    expect(result.quickReplies).toHaveLength(4);
    expect(result.multiSelect).toBe(false);
  });

  it('parses Inspo-style goal_suggestion response', () => {
    const result = goalSuggestionResponseSchema.parse(guitarGoalSuggestion);
    expect(result.suggestedHobby).toBe('Guitar');
    expect(result.suggestedLevel).toBe('beginner');
  });

  it('parses discriminated union for both response types', () => {
    expect(roadmapCreationChatResponseSchema.parse(guitarClarificationQ1).type).toBe(
      'clarification',
    );
    expect(roadmapCreationChatResponseSchema.parse(guitarGoalSuggestion).type).toBe(
      'goal_suggestion',
    );
  });

  it('rejects clarification with fewer than 2 quick replies', () => {
    expect(() =>
      clarificationResponseSchema.parse({
        ...guitarClarificationQ1,
        quickReplies: [{ text: 'Only one' }],
      }),
    ).toThrow();
  });

  it('rejects goal_suggestion missing suggestedHobby', () => {
    const { suggestedHobby: _, ...withoutHobby } = guitarGoalSuggestion;
    expect(() => goalSuggestionResponseSchema.parse(withoutHobby)).toThrow();
  });

  it('parses clarifying request with 4–5 messages', () => {
    const request = roadmapCreationChatRequestSchema.parse({
      message: '- Rock or Indie',
      messages: [
        { role: 'user', content: 'i want to learn guitar' },
        { role: 'assistant', content: guitarClarificationQ1.message },
        { role: 'user', content: 'Complete beginner (never held one)' },
        { role: 'assistant', content: "That's exciting! What is your main goal?" },
        { role: 'user', content: '- Write my own music' },
      ],
      flowState: 'clarifying',
      userRoles: ['Student', 'Developer/Engineer'],
      isFirstRoadmap: true,
    });
    expect(request.messages).toHaveLength(5);
    expect(request.userRoles).toContain('Student');
  });

  it('uses 4–5 question budget constants', () => {
    expect(MIN_CLARIFICATION_ROUNDS).toBe(4);
    expect(MAX_CLARIFICATION_ROUNDS).toBe(5);
    expect(MAX_CLARIFICATION_ROUNDS).toBeGreaterThanOrEqual(MIN_CLARIFICATION_ROUNDS);
  });
});

describe('formatClarificationAnswer', () => {
  it('prefixes selected chips with "- " and appends free text', () => {
    const result = formatClarificationAnswer(
      ['Record songs at home', 'Share music on social media'],
      'i want to be better play better',
    );
    expect(result).toBe(
      '- Record songs at home\n- Share music on social media\ni want to be better play better',
    );
  });

  it('supports chips-only answer', () => {
    expect(formatClarificationAnswer(['Write my own music'], '')).toBe('- Write my own music');
  });

  it('supports free-text-only answer', () => {
    expect(formatClarificationAnswer([], 'Complete beginner (never held one)')).toBe(
      'Complete beginner (never held one)',
    );
  });
});
