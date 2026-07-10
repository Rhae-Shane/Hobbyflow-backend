import { buildLessonPlanUserPrompt } from '../src/services/langgraph/prompts/lessonGenerationPrompts';

// Graph unit tests with mocked LLM + media.

jest.mock('../src/services/langgraph/llm', () => ({
  invokeChatModel: jest.fn(async () => ({
    content: JSON.stringify({
      pages: [
        {
          heading: 'What You Will Learn',
          markdown: 'The **beat** is the pulse.',
          imageQuery: 'drum beat pulse diagram',
        },
        {
          heading: 'The Heartbeat of Music',
          markdown: 'Tap your foot to feel time.',
          imageQuery: 'foot tapping to music',
        },
        {
          heading: 'Finding the Pulse',
          markdown: 'Listen first, then move.',
          imageQuery: 'listening for rhythm',
        },
        {
          heading: 'How to Apply It',
          markdown: 'Play along for one minute.',
          imageQuery: 'beginner drum practice',
        },
      ],
      videoQuery: 'beginner drumming keeping time tutorial',
      audioQuery: 'metronome drum play along',
      keywords: [
        { name: 'Beat', description: 'Steady pulse' },
        { name: 'Tempo', description: 'Speed of the music' },
        { name: 'Pulse', description: 'Underlying heartbeat' },
      ],
    }),
  })),
}));

jest.mock('../src/services/lesson/mediaResolve', () => ({
  resolveYouTubeVideo: jest.fn(async (query: string, kind: 'video' | 'audio') => ({
    id: kind === 'video' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
    kind,
    url: `https://www.youtube.com/watch?v=${kind === 'video' ? 'oI_EnzY4jvY' : '5qap5aO4i9A'}`,
    title: kind === 'video' ? 'Watch' : 'Listen',
    source: {
      provider: 'youtube',
      searchQuery: query,
      externalId: kind === 'video' ? 'oI_EnzY4jvY' : '5qap5aO4i9A',
      sourceUrl: `https://www.youtube.com/watch?v=${kind === 'video' ? 'oI_EnzY4jvY' : '5qap5aO4i9A'}`,
      fetchedAt: new Date().toISOString(),
    },
    thumbnailUrl: `https://i.ytimg.com/vi/${kind === 'video' ? 'oI_EnzY4jvY' : '5qap5aO4i9A'}/hqdefault.jpg`,
  })),
  resolveLessonImage: jest.fn(async ({ alt }: { alt: string }) => ({
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'image',
    url: 'https://example.com/lesson-media/demo.svg',
    alt,
    source: {
      provider: 'llm_svg',
      searchQuery: 'hidden from client',
      sourceUrl: 'https://example.com/lesson-media/demo.svg',
      fetchedAt: new Date().toISOString(),
    },
  })),
}));

import {
  createLessonGenerationGraph,
  initialStateFromInput,
  parseLessonDraft,
} from '../src/services/langgraph/graphs/lessonGenerationGraph';
import {
  assertNoSearchUrlsInContent,
  sanitizeLessonContentForClient,
} from '../src/schemas/lessonContent.schema';

describe('lessonGenerationGraph', () => {
  it('parses a valid draft', () => {
    const draft = parseLessonDraft(
      JSON.stringify({
        pages: [
          { heading: 'A', markdown: 'a', imageQuery: 'img a' },
          { heading: 'B', markdown: 'b', imageQuery: 'img b' },
          { heading: 'C', markdown: 'c', imageQuery: 'img c' },
          { heading: 'D', markdown: 'd', imageQuery: 'img d' },
        ],
        videoQuery: 'v',
        audioQuery: 'a',
        keywords: [{ name: 'K', description: 'D' }],
      }),
    );
    expect(draft.pages).toHaveLength(4);
  });

  it('produces pages with concrete media and no search URLs', async () => {
    const graph = createLessonGenerationGraph();
    const result = await graph.invoke(
      initialStateFromInput({
        userId: 'user',
        roadmapId: 'roadmap',
        lessonId: 'lesson',
        nodeId: 'node',
        hobby: 'Drums',
        sessionConfig: {
          name: 'Keeping Time',
          hook: 'Can you find the pulse?',
          meaning: 'The beat is the heartbeat.',
        },
        personalize: { learningGoal: 'Play along', backgroundLevel: 'Beginner' },
        allowVideo: true,
        allowAudio: true,
        allowImages: true,
        requestGroupId: '44444444-4444-4444-8444-444444444444',
        startedAtMs: Date.now(),
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();
    assertNoSearchUrlsInContent(result.content!);

    const publicContent = sanitizeLessonContentForClient(result.content!);
    expect(publicContent.pages.length).toBeGreaterThanOrEqual(4);
    expect(publicContent.media.some((m) => m.kind === 'image')).toBe(true);
    expect(publicContent.media.some((m) => m.kind === 'video')).toBe(true);
    expect(publicContent.media.some((m) => m.kind === 'audio')).toBe(true);

    for (const asset of publicContent.media) {
      expect(asset.source).not.toHaveProperty('searchQuery');
      expect(JSON.stringify(asset)).not.toMatch(/search_query/);
    }

    const serialized = JSON.stringify(publicContent);
    expect(serialized).not.toMatch(/youtube\.com\/results/);
    expect(serialized).not.toMatch(/google\.[^"]+\/search/);
  });

  it('skips audio when modality forbidden', async () => {
    const graph = createLessonGenerationGraph();
    const result = await graph.invoke(
      initialStateFromInput({
        userId: 'user',
        roadmapId: 'roadmap',
        lessonId: 'lesson',
        nodeId: 'node',
        hobby: 'Drums',
        sessionConfig: {
          name: 'Keeping Time',
          hook: 'Hook',
          meaning: 'Meaning',
        },
        personalize: {},
        allowVideo: true,
        allowAudio: false,
        allowImages: true,
        requestGroupId: '55555555-5555-4555-8555-555555555555',
        startedAtMs: Date.now(),
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.content?.media.some((m) => m.kind === 'audio')).toBe(false);
    expect(result.skippedModalities).toContain('audio');
  });

  it('prompt tells the model not to put search URLs in markdown', () => {
    const prompt = buildLessonPlanUserPrompt({
      hobby: 'Drums',
      lessonName: 'Keeping Time',
      hook: 'Hook',
      meaning: 'Meaning',
      allowVideo: true,
      allowAudio: true,
      allowImages: true,
    });
    expect(prompt).toContain('imageQuery');
    expect(prompt).toContain('videoQuery');
  });
});
