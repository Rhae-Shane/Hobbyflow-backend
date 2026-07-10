import { randomUUID } from 'crypto';
import {
  assertNoSearchUrlsInContent,
  lessonDraftSchema,
  lessonNodeContentSchema,
  sanitizeLessonContentForClient,
  validateFinalContent,
  type LessonNodeContent,
} from '../src/schemas/lessonContent.schema';

function sampleContent(overrides?: Partial<LessonNodeContent>): LessonNodeContent {
  const imageId = randomUUID();
  const videoId = randomUUID();
  const audioId = randomUUID();
  return lessonNodeContentSchema.parse({
    pages: [
      {
        heading: 'What You Will Learn',
        blocks: [
          { type: 'markdown', markdown: 'Learn the **beat**.' },
          { type: 'image', mediaId: imageId, caption: 'Pulse' },
        ],
      },
      {
        heading: 'Watch',
        blocks: [
          { type: 'markdown', markdown: 'See it in action.' },
          { type: 'video', mediaId: videoId },
        ],
      },
      {
        heading: 'Listen',
        blocks: [
          { type: 'markdown', markdown: 'Feel the pulse.' },
          { type: 'audio', mediaId: audioId },
        ],
      },
      {
        heading: 'Apply',
        blocks: [{ type: 'markdown', markdown: 'Practice for one minute.' }],
      },
    ],
    media: [
      {
        id: imageId,
        kind: 'image',
        url: 'https://example.com/lesson-media/pulse.svg',
        alt: 'Pulse',
        source: {
          provider: 'llm_svg',
          searchQuery: 'drum pulse illustration',
          fetchedAt: new Date().toISOString(),
        },
      },
      {
        id: videoId,
        kind: 'video',
        url: 'https://www.youtube.com/watch?v=oI_EnzY4jvY',
        source: {
          provider: 'youtube',
          searchQuery: 'drumming keeping time tutorial',
          externalId: 'oI_EnzY4jvY',
          sourceUrl: 'https://www.youtube.com/watch?v=oI_EnzY4jvY',
          fetchedAt: new Date().toISOString(),
        },
        thumbnailUrl: 'https://i.ytimg.com/vi/oI_EnzY4jvY/hqdefault.jpg',
      },
      {
        id: audioId,
        kind: 'audio',
        url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        source: {
          provider: 'youtube',
          searchQuery: 'metronome play along',
          externalId: '5qap5aO4i9A',
          sourceUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
          fetchedAt: new Date().toISOString(),
        },
      },
    ],
    keywords: [{ name: 'Beat', description: 'Steady pulse' }],
    concepts: [],
    sourceContent: '',
    ...overrides,
  });
}

describe('lessonContent.schema', () => {
  it('accepts a full multimedia lesson', () => {
    const content = sampleContent();
    expect(content.pages).toHaveLength(4);
    expect(validateFinalContent(content, {
      requireImage: true,
      requireVideo: true,
      requireAudio: true,
    })).toEqual({ ok: true });
  });

  it('rejects search-result URLs in media', () => {
    const content = sampleContent();
    content.media[1]!.url = 'https://www.youtube.com/results?search_query=drums';
    expect(() => assertNoSearchUrlsInContent(content)).toThrow(/search results/);
  });

  it('requires externalId for video and audio', () => {
    const content = sampleContent();
    delete content.media[1]!.source.externalId;
    expect(() => assertNoSearchUrlsInContent(content)).toThrow(/externalId/);
  });

  it('strips searchQuery for the client', () => {
    const content = sampleContent();
    const publicContent = sanitizeLessonContentForClient(content);
    for (const asset of publicContent.media) {
      expect(asset.source).not.toHaveProperty('searchQuery');
      expect(asset.url).not.toMatch(/results\?search_query/);
    }
  });

  it('validates draft page bounds', () => {
    expect(() =>
      lessonDraftSchema.parse({
        pages: [{ heading: 'Only one', markdown: 'Nope' }],
        keywords: [{ name: 'A', description: 'B' }],
      }),
    ).toThrow();
  });

  it('fails final validation when video missing but required', () => {
    const content = sampleContent();
    content.media = content.media.filter((m) => m.kind !== 'video');
    content.pages = content.pages.map((p) => ({
      ...p,
      blocks: p.blocks.filter((b) => b.type !== 'video'),
    }));
    const result = validateFinalContent(content, {
      requireImage: true,
      requireVideo: true,
      requireAudio: true,
    });
    expect(result.ok).toBe(false);
  });
});
