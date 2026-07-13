import { z } from 'zod';

export const GRAPH_VERSION = 'lesson-generation-v2';

export const lessonMediaKindSchema = z.enum(['image', 'video', 'audio']);

export const lessonMediaProviderSchema = z.enum([
  'google_images',
  'wikimedia',
  'youtube',
  'llm_svg',
  'upload',
  'curated',
]);

/** Internal asset (may include searchQuery for provenance). */
export const lessonMediaAssetSchema = z.object({
  id: z.string().uuid(),
  kind: lessonMediaKindSchema,
  url: z.string().min(1),
  storagePath: z.string().optional(),
  title: z.string().optional(),
  alt: z.string().optional(),
  source: z.object({
    provider: lessonMediaProviderSchema,
    searchQuery: z.string().optional(),
    externalId: z.string().optional(),
    sourceUrl: z.string().min(1).optional(),
    fetchedAt: z.string(),
  }),
  durationSeconds: z.number().nonnegative().optional(),
  thumbnailUrl: z.string().min(1).optional(),
});

export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('markdown'),
    markdown: z.string().min(1),
  }),
  z.object({
    type: z.literal('image'),
    mediaId: z.string().uuid(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal('video'),
    mediaId: z.string().uuid(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal('audio'),
    mediaId: z.string().uuid(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal('interactive'),
    interactiveType: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  }),
]);

export const lessonPageSchema = z.object({
  heading: z.string().min(1),
  blocks: z.array(lessonBlockSchema).min(1),
});

export const lessonNodeContentSchema = z.object({
  pages: z.array(lessonPageSchema).min(1),
  media: z.array(lessonMediaAssetSchema).default([]),
  keywords: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .default([]),
  concepts: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .default([]),
  sourceContent: z.string().default(''),
  generation: z
    .object({
      graphVersion: z.string(),
      generatedAt: z.string(),
      requestGroupId: z.string().uuid(),
      durationMs: z.number().nonnegative(),
      skippedModalities: z.array(z.string()).optional(),
    })
    .optional(),
});

export const lessonDraftPageSchema = z.object({
  heading: z.string().min(1),
  markdown: z.string().min(1),
  imageQuery: z.string().min(1).optional(),
});

export const lessonDraftSchema = z.object({
  pages: z.array(lessonDraftPageSchema).min(4).max(8),
  /** Preferred: 2–3 distinct YouTube search phrases for the lesson. */
  videoQueries: z.array(z.string().min(1)).min(1).max(4).optional(),
  /** Legacy single-query field (still accepted). */
  videoQuery: z.string().min(1).optional(),
  audioQuery: z.string().min(1).optional(),
  keywords: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1)
    .max(8),
});

export const generateLessonRequestSchema = z.object({
  force: z.boolean().optional().default(false),
  /** When true (with force), rewrite lesson title/hook/meaning before regenerating media. */
  rewriteSession: z.boolean().optional().default(false),
});

export const regenerateSectionRequestSchema = z.object({
  /** After rewriting titles, also force-regenerate multimedia for each active lesson (slow). */
  regenerateContent: z.boolean().optional().default(false),
});

export const regenerateSectionResponseSchema = z.object({
  sectionId: z.string().uuid(),
  sectionName: z.string(),
  lessonIds: z.array(z.string().uuid()),
  contentResults: z
    .array(
      z.object({
        lessonId: z.string().uuid(),
        status: z.enum(['success', 'generating', 'failed', 'skipped']),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

export const generateLessonResponseSchema = z.object({
  status: z.enum(['success', 'generating', 'failed']),
  message: z.string().optional(),
  lessonId: z.string().uuid(),
  nodeId: z.string().uuid().optional(),
  requestGroupId: z.string().uuid().optional(),
  generationDurationMs: z.number().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

/** Client-facing media: never expose searchQuery. */
export const publicLessonMediaAssetSchema = lessonMediaAssetSchema.extend({
  source: z.object({
    provider: lessonMediaProviderSchema,
    externalId: z.string().optional(),
    sourceUrl: z.string().min(1).optional(),
    fetchedAt: z.string(),
  }),
});

export const publicLessonNodeContentSchema = lessonNodeContentSchema.extend({
  media: z.array(publicLessonMediaAssetSchema).default([]),
});

export type LessonMediaAsset = z.infer<typeof lessonMediaAssetSchema>;
export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type LessonPage = z.infer<typeof lessonPageSchema>;
export type LessonNodeContent = z.infer<typeof lessonNodeContentSchema>;
export type LessonDraft = z.infer<typeof lessonDraftSchema>;
export type GenerateLessonRequest = z.infer<typeof generateLessonRequestSchema>;
export type GenerateLessonResponse = z.infer<typeof generateLessonResponseSchema>;
export type PublicLessonNodeContent = z.infer<typeof publicLessonNodeContentSchema>;

const SEARCH_RESULT_URL_RE =
  /youtube\.com\/results\?|google\.[^/]+\/search|images\.google\.|bing\.com\/images/i;

export function assertNoSearchUrlsInContent(content: LessonNodeContent): void {
  for (const asset of content.media) {
    if (SEARCH_RESULT_URL_RE.test(asset.url)) {
      throw new Error(`Media url must not be a search results page: ${asset.url}`);
    }
    if (asset.source.sourceUrl && SEARCH_RESULT_URL_RE.test(asset.source.sourceUrl)) {
      throw new Error(`Media sourceUrl must not be a search results page`);
    }
    if (asset.kind === 'video' || asset.kind === 'audio') {
      if (!asset.source.externalId) {
        throw new Error(`${asset.kind} media must have a concrete externalId (videoId)`);
      }
    }
  }

  const mediaIds = new Set(content.media.map((m) => m.id));
  for (const page of content.pages) {
    for (const block of page.blocks) {
      if (
        (block.type === 'image' || block.type === 'video' || block.type === 'audio') &&
        !mediaIds.has(block.mediaId)
      ) {
        throw new Error(`Block references missing mediaId ${block.mediaId}`);
      }
    }
  }
}

export function sanitizeLessonContentForClient(
  content: LessonNodeContent,
): PublicLessonNodeContent {
  return publicLessonNodeContentSchema.parse({
    ...content,
    media: content.media.map((asset) => ({
      ...asset,
      source: {
        provider: asset.source.provider,
        externalId: asset.source.externalId,
        sourceUrl: asset.source.sourceUrl,
        fetchedAt: asset.source.fetchedAt,
      },
    })),
  });
}

export function validateFinalContent(
  content: LessonNodeContent,
  options: {
    requireImage: boolean;
    requireVideo: boolean;
    requireAudio: boolean;
  },
): { ok: true } | { ok: false; error: string } {
  try {
    lessonNodeContentSchema.parse(content);
    assertNoSearchUrlsInContent(content);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid lesson content',
    };
  }

  const kinds = new Set(content.media.map((m) => m.kind));
  if (options.requireImage && !kinds.has('image')) {
    return { ok: false, error: 'Lesson must include at least one image' };
  }
  if (options.requireVideo && !kinds.has('video')) {
    return { ok: false, error: 'Lesson must include at least one video' };
  }
  if (options.requireAudio && !kinds.has('audio')) {
    return { ok: false, error: 'Lesson must include at least one audio' };
  }

  return { ok: true };
}
