import { buildLessonPlanUserPrompt } from '../src/services/langgraph/prompts/lessonGenerationPrompts';

// Graph unit tests with mocked LLM + media.

jest.mock('../src/services/langgraph/llm', () => ({
  invokeChatModel: jest.fn(async () => ({
    content: JSON.stringify({
      pages: [
        {
          heading: 'What You Will Learn',
          markdown: 'The **beat** is the pulse.\n\n* **Feel time** — tap steadily\n* **Count aloud** — stay locked in',
          imageQuery: 'Drums beat pulse diagram',
        },
        {
          heading: 'The Heartbeat of Music',
          markdown: 'Tap your foot to feel time across a full bar.',
          imageQuery: 'Drums foot tapping to music',
        },
        {
          heading: 'Finding the Pulse',
          markdown: 'Listen first, then move with the metronome.',
          imageQuery: 'Drums listening for rhythm',
        },
        {
          heading: 'Moving With the Groove',
          markdown: 'Coordinate limbs while keeping a steady pulse.',
          imageQuery: 'Drums limb coordination diagram',
        },
        {
          heading: 'First Song Practice',
          markdown: 'Play along for one minute without rushing.',
          imageQuery: 'Drums beginner play along',
        },
        {
          heading: 'Apply Keeping Time Today',
          markdown: 'Use the pulse in a short real practice session.',
          imageQuery: 'Drums applying keeping time',
        },
      ],
      videoQueries: [
        'Drums keeping time explained',
        'Drums keeping time example demo',
        'Drums keeping time practice drill',
      ],
      audioQuery: 'Drums metronome play along',
      keywords: [
        { name: 'Beat', description: 'Steady pulse' },
        { name: 'Tempo', description: 'Speed of the music' },
        { name: 'Pulse', description: 'Underlying heartbeat' },
      ],
    }),
  })),
}));

jest.mock('../src/services/lesson/mediaResolve', () => ({
  resolveYouTubeVideo: jest.fn(async (query: string, kind: 'video' | 'audio') => {
    const id =
      kind === 'audio'
        ? '22222222-2222-4222-8222-222222222222'
        : query.includes('demo')
          ? '11111111-1111-4111-8111-111111111112'
          : query.includes('drill')
            ? '11111111-1111-4111-8111-111111111113'
            : '11111111-1111-4111-8111-111111111111';
    const videoId =
      kind === 'audio'
        ? '5qap5aO4i9A'
        : query.includes('demo')
          ? 'oI_EnzY4jvY'
          : query.includes('drill')
            ? 'dQw4w9WgXcQ'
            : 'jNQXAC9IVRw';
    return {
      id,
      kind,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: kind === 'video' ? `Watch ${query}` : 'Listen',
      source: {
        provider: 'youtube',
        searchQuery: query,
        externalId: videoId,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        fetchedAt: new Date().toISOString(),
      },
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }),
  resolveLessonImage: jest.fn(async ({ alt, query }: { alt: string; query: string }) => {
    const hash = Buffer.from(`${query}:${alt}`).toString('hex').slice(0, 12).padEnd(12, '0');
    return {
      id: `33333333-3333-4333-8333-${hash}`,
      kind: 'image',
      url: `https://example.com/lesson-media/${encodeURIComponent(query)}.jpg`,
      alt,
      source: {
        provider: 'wikimedia',
        searchQuery: query,
        sourceUrl: `https://example.com/lesson-media/${encodeURIComponent(query)}.jpg`,
        fetchedAt: new Date().toISOString(),
      },
    };
  }),
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
    expect(publicContent.media.filter((m) => m.kind === 'image').length).toBeGreaterThanOrEqual(4);
    expect(publicContent.media.filter((m) => m.kind === 'video').length).toBeGreaterThanOrEqual(2);
    expect(publicContent.media.some((m) => m.kind === 'audio')).toBe(true);

    const imageBlocks = publicContent.pages.flatMap((p) =>
      p.blocks.filter((b) => b.type === 'image'),
    );
    expect(imageBlocks.length).toBeGreaterThanOrEqual(4);

    const videoBlocks = publicContent.pages.flatMap((p) =>
      p.blocks.filter((b) => b.type === 'video'),
    );
    expect(videoBlocks.length).toBeGreaterThanOrEqual(2);

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

  it('prompt tells the model not to put search URLs in markdown and keep queries on-hobby', () => {
    const prompt = buildLessonPlanUserPrompt({
      hobby: 'Drums',
      lessonName: 'Keeping Time',
      hook: 'Hook',
      meaning: 'Meaning',
      siblingLessonNames: ['Hand Techniques', 'First Groove'],
      learnerContext: 'Formats: Video (video demos)',
      allowVideo: true,
      allowAudio: true,
      allowImages: true,
    });
    expect(prompt).toContain('imageQuery');
    expect(prompt).toContain('videoQueries');
    expect(prompt).toContain('starting with "Drums"');
    expect(prompt).toContain('Learner prefs');
    expect(prompt).toContain('Formats: Video');
    expect(prompt).toContain('What You Will Learn');
    expect(prompt).toContain('at least ~120 words');
    expect(prompt).toContain('Forbidden generic headings');
    expect(prompt).toContain('Hand Techniques');
    expect(prompt).toContain('AVOID repeating');
    expect(prompt).toContain('distinct imageQuery');
    expect(prompt).toContain('2 or 3 DIFFERENT');
  });
});
