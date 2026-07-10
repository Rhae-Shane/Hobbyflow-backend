import { randomUUID } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  GRAPH_VERSION,
  lessonDraftSchema,
  type LessonDraft,
  type LessonMediaAsset,
  type LessonNodeContent,
  type LessonPage,
  validateFinalContent,
} from '../../../schemas/lessonContent.schema';
import { createChildLogger } from '../../../lib/logger';
import { resolveLessonImage, resolveYouTubeVideo } from '../../lesson/mediaResolve';
import { invokeChatModel } from '../llm';
import {
  buildLessonGenerationSystemPrompt,
  buildLessonPlanUserPrompt,
} from '../prompts/lessonGenerationPrompts';

const log = createChildLogger({ module: 'lessonGenerationGraph' });

export type LessonGenerationGraphInput = {
  userId: string;
  roadmapId: string;
  lessonId: string;
  nodeId: string;
  hobby: string;
  learnerContext?: string;
  sessionConfig: { name: string; hook: string; meaning: string };
  personalize: { learningGoal?: string; backgroundLevel?: string };
  roadmapTitle?: string;
  siblingLessonNames?: string[];
  allowVideo: boolean;
  allowAudio: boolean;
  allowImages: boolean;
  requestGroupId: string;
  startedAtMs: number;
};

export const LessonGenerationState = Annotation.Root({
  userId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  roadmapId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  lessonId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  nodeId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  hobby: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  learnerContext: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  sessionConfig: Annotation<{ name: string; hook: string; meaning: string }>({
    reducer: (_, r) => r,
    default: () => ({ name: '', hook: '', meaning: '' }),
  }),
  personalize: Annotation<{ learningGoal?: string; backgroundLevel?: string }>({
    reducer: (_, r) => r,
    default: () => ({}),
  }),
  roadmapTitle: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  siblingLessonNames: Annotation<string[]>({ reducer: (_, r) => r, default: () => [] }),
  allowVideo: Annotation<boolean>({ reducer: (_, r) => r, default: () => true }),
  allowAudio: Annotation<boolean>({ reducer: (_, r) => r, default: () => true }),
  allowImages: Annotation<boolean>({ reducer: (_, r) => r, default: () => true }),
  requestGroupId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  startedAtMs: Annotation<number>({ reducer: (_, r) => r, default: () => 0 }),
  draft: Annotation<LessonDraft | null>({ reducer: (_, r) => r, default: () => null }),
  draftErrors: Annotation<string[]>({ reducer: (_, r) => r, default: () => [] }),
  parseAttempt: Annotation<number>({ reducer: (_, r) => r, default: () => 0 }),
  media: Annotation<LessonMediaAsset[]>({ reducer: (_, r) => r, default: () => [] }),
  pages: Annotation<LessonPage[]>({ reducer: (_, r) => r, default: () => [] }),
  content: Annotation<LessonNodeContent | null>({ reducer: (_, r) => r, default: () => null }),
  error: Annotation<string | undefined>({ reducer: (_, r) => r, default: () => undefined }),
  skippedModalities: Annotation<string[]>({ reducer: (_, r) => r, default: () => [] }),
});

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseLessonDraft(raw: string): LessonDraft {
  const extracted = extractJsonObject(raw);
  // LLMs sometimes emit raw newlines inside JSON strings — sanitize control chars.
  const sanitized = extracted.replace(/[\u0000-\u001f]+/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return ' ';
  });
  const parsed = JSON.parse(sanitized) as unknown;
  return lessonDraftSchema.parse(parsed);
}

function buildFallbackDraft(state: typeof LessonGenerationState.State): LessonDraft {
  const name = state.sessionConfig.name || 'Lesson';
  return {
    pages: [
      {
        heading: 'What You Will Learn',
        markdown: `**${name}**\n\n${state.sessionConfig.meaning}\n\n${state.sessionConfig.hook}`,
        imageQuery: `${state.hobby} ${name} beginner illustration`,
      },
      {
        heading: 'The Core Idea',
        markdown: `Start with the basics of **${name}**. Focus on one clear skill at a time and practice slowly.`,
        imageQuery: `${state.hobby} ${name} core concept diagram`,
      },
      {
        heading: 'Try It Yourself',
        markdown: `Practice the key movement or idea from **${name}**. Keep the tempo steady and notice what feels awkward — that is where learning happens.`,
        imageQuery: `${state.hobby} practice ${name}`,
      },
      {
        heading: 'How to Apply It',
        markdown: `Use **${name}** in a short real-world session today. Consistency matters more than speed.`,
        imageQuery: `${state.hobby} applying ${name}`,
      },
    ],
    videoQuery: `${state.hobby} ${name} beginner tutorial`,
    audioQuery: `${state.hobby} ${name} play along podcast`,
    keywords: [
      {
        name,
        description: state.sessionConfig.meaning || `Key idea from ${name}`,
      },
      {
        name: 'Practice',
        description: 'Short, focused repetition that builds skill.',
      },
      {
        name: 'Consistency',
        description: 'Showing up regularly matters more than long sessions.',
      },
    ],
  };
}

async function planContent(
  state: typeof LessonGenerationState.State,
): Promise<Partial<typeof LessonGenerationState.State>> {
  const prompt = buildLessonPlanUserPrompt({
    hobby: state.hobby,
    lessonName: state.sessionConfig.name,
    hook: state.sessionConfig.hook,
    meaning: state.sessionConfig.meaning,
    learningGoal: state.personalize.learningGoal,
    backgroundLevel: state.personalize.backgroundLevel,
    roadmapTitle: state.roadmapTitle,
    siblingLessonNames: state.siblingLessonNames,
    allowVideo: state.allowVideo,
    allowAudio: state.allowAudio,
    allowImages: state.allowImages,
    repairErrors: state.draftErrors,
  });

  try {
    const response = await invokeChatModel([
      new SystemMessage(buildLessonGenerationSystemPrompt()),
      new HumanMessage(prompt),
    ]);
    const raw =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const draft = parseLessonDraft(raw);
    return { draft, draftErrors: [], parseAttempt: state.parseAttempt + 1 };
  } catch (error) {
    log.warn({ err: error, attempt: state.parseAttempt }, 'plan_content failed');
    if (state.parseAttempt >= 1) {
      return {
        draft: buildFallbackDraft(state),
        draftErrors: [],
        parseAttempt: state.parseAttempt + 1,
      };
    }
    return {
      draftErrors: [error instanceof Error ? error.message : 'Failed to plan lesson'],
      parseAttempt: state.parseAttempt + 1,
    };
  }
}

function validateDraft(
  state: typeof LessonGenerationState.State,
): Partial<typeof LessonGenerationState.State> {
  if (!state.draft) {
    return { draftErrors: ['Missing draft'] };
  }

  const errors: string[] = [];
  const parsed = lessonDraftSchema.safeParse(state.draft);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((i) => i.message));
  } else {
    if (state.allowImages && !parsed.data.pages.some((p) => p.imageQuery)) {
      errors.push('At least one page needs an imageQuery');
    }
    if (state.allowVideo && !parsed.data.videoQuery) {
      errors.push('videoQuery is required');
    }
    if (state.allowAudio && !parsed.data.audioQuery) {
      errors.push('audioQuery is required');
    }
  }

  return { draftErrors: errors };
}

function routeAfterValidate(state: typeof LessonGenerationState.State): 'resolve_media' | 'retry_plan' | 'fail' {
  if (state.draftErrors.length === 0 && state.draft) return 'resolve_media';
  if (state.parseAttempt < 2) return 'retry_plan';
  return 'fail';
}

async function resolveMedia(
  state: typeof LessonGenerationState.State,
): Promise<Partial<typeof LessonGenerationState.State>> {
  if (!state.draft) {
    return { error: 'No draft to resolve media for' };
  }

  const media: LessonMediaAsset[] = [];
  const skipped: string[] = [];
  const draft = state.draft;

  if (state.allowImages) {
    const queries = draft.pages
      .map((p) => ({ query: p.imageQuery, heading: p.heading }))
      .filter((p): p is { query: string; heading: string } => Boolean(p.query));

    const toFetch = queries.length > 0 ? queries.slice(0, 3) : [
      { query: `${state.hobby} ${state.sessionConfig.name}`, heading: state.sessionConfig.name },
    ];

    for (const item of toFetch) {
      const asset = await resolveLessonImage({
        query: item.query,
        alt: item.heading,
        userId: state.userId,
        roadmapId: state.roadmapId,
        nodeId: state.nodeId,
      });
      media.push(asset);
    }
  } else {
    skipped.push('image');
  }

  if (state.allowVideo) {
    const video = await resolveYouTubeVideo(
      draft.videoQuery ?? `${state.hobby} ${state.sessionConfig.name} tutorial`,
      'video',
    );
    media.push(video);
  } else {
    skipped.push('video');
  }

  if (state.allowAudio) {
    const audio = await resolveYouTubeVideo(
      draft.audioQuery ?? `${state.hobby} ${state.sessionConfig.name} play along`,
      'audio',
    );
    media.push(audio);
  } else {
    skipped.push('audio');
  }

  return { media, skippedModalities: skipped };
}

function assemblePages(
  state: typeof LessonGenerationState.State,
): Partial<typeof LessonGenerationState.State> {
  if (!state.draft) {
    return { error: 'No draft to assemble' };
  }

  const images = state.media.filter((m) => m.kind === 'image');
  const video = state.media.find((m) => m.kind === 'video');
  const audio = state.media.find((m) => m.kind === 'audio');

  const pages: LessonPage[] = state.draft.pages.map((page, index) => {
    const blocks: LessonPage['blocks'] = [
      { type: 'markdown', markdown: page.markdown },
    ];

    const image = images[index] ?? images[0];
    if (image && index < images.length) {
      blocks.push({
        type: 'image',
        mediaId: image.id,
        caption: page.heading,
      });
    }

    if (index === 1 && video) {
      blocks.push({
        type: 'video',
        mediaId: video.id,
        caption: video.title ?? 'Watch',
      });
    }

    if (index === state.draft!.pages.length - 1 && audio) {
      blocks.push({
        type: 'audio',
        mediaId: audio.id,
        caption: audio.title ?? 'Listen',
      });
    }

    return { heading: page.heading, blocks };
  });

  // Ensure video/audio appear somewhere if pages were short
  if (video && !pages.some((p) => p.blocks.some((b) => b.type === 'video'))) {
    pages[0]?.blocks.push({ type: 'video', mediaId: video.id, caption: video.title });
  }
  if (audio && !pages.some((p) => p.blocks.some((b) => b.type === 'audio'))) {
    pages[pages.length - 1]?.blocks.push({
      type: 'audio',
      mediaId: audio.id,
      caption: audio.title,
    });
  }
  if (images[0] && !pages.some((p) => p.blocks.some((b) => b.type === 'image'))) {
    pages[0]?.blocks.push({
      type: 'image',
      mediaId: images[0].id,
      caption: pages[0].heading,
    });
  }

  const content: LessonNodeContent = {
    pages,
    media: state.media,
    keywords: state.draft.keywords,
    concepts: [],
    sourceContent: '',
    generation: {
      graphVersion: GRAPH_VERSION,
      generatedAt: new Date().toISOString(),
      requestGroupId: state.requestGroupId || randomUUID(),
      durationMs: Math.max(0, Date.now() - state.startedAtMs),
      skippedModalities: state.skippedModalities,
    },
  };

  const validation = validateFinalContent(content, {
    requireImage: state.allowImages,
    requireVideo: state.allowVideo,
    requireAudio: state.allowAudio,
  });

  if (!validation.ok) {
    return { pages, content, error: validation.error };
  }

  return { pages, content, error: undefined };
}

function markFailed(
  state: typeof LessonGenerationState.State,
): Partial<typeof LessonGenerationState.State> {
  return {
    error: state.error ?? (state.draftErrors.join('; ') || 'Lesson generation failed'),
  };
}

export function initialStateFromInput(
  input: LessonGenerationGraphInput,
): typeof LessonGenerationState.State {
  return {
    userId: input.userId,
    roadmapId: input.roadmapId,
    lessonId: input.lessonId,
    nodeId: input.nodeId,
    hobby: input.hobby,
    learnerContext: input.learnerContext ?? '',
    sessionConfig: input.sessionConfig,
    personalize: input.personalize,
    roadmapTitle: input.roadmapTitle ?? '',
    siblingLessonNames: input.siblingLessonNames ?? [],
    allowVideo: input.allowVideo,
    allowAudio: input.allowAudio,
    allowImages: input.allowImages,
    requestGroupId: input.requestGroupId,
    startedAtMs: input.startedAtMs,
    draft: null,
    draftErrors: [],
    parseAttempt: 0,
    media: [],
    pages: [],
    content: null,
    error: undefined,
    skippedModalities: [],
  };
}

export function createLessonGenerationGraph() {
  const graph = new StateGraph(LessonGenerationState)
    .addNode('plan_content', planContent)
    .addNode('validate_draft', validateDraft)
    .addNode('retry_plan', planContent)
    .addNode('resolve_media', resolveMedia)
    .addNode('assemble_pages', assemblePages)
    .addNode('mark_failed', markFailed)
    .addEdge(START, 'plan_content')
    .addEdge('plan_content', 'validate_draft')
    .addConditionalEdges('validate_draft', routeAfterValidate, {
      resolve_media: 'resolve_media',
      retry_plan: 'retry_plan',
      fail: 'mark_failed',
    })
    .addEdge('retry_plan', 'validate_draft')
    .addEdge('resolve_media', 'assemble_pages')
    .addEdge('assemble_pages', END)
    .addEdge('mark_failed', END);

  return graph.compile();
}
