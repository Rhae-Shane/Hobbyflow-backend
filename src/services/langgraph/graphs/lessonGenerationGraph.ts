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
  const meaning =
    state.sessionConfig.meaning?.trim() ||
    `Build a clear, practical understanding of ${name}.`;
  const hook =
    state.sessionConfig.hook?.trim() ||
    `What changes when you can confidently use ${name}?`;
  const goal = state.personalize.learningGoal?.trim();

  return {
    pages: [
      {
        heading: 'What You Will Learn',
        markdown: [
          goal
            ? `This lesson on **${name}** moves you closer to: ${goal}`
            : `This lesson focuses on **${name}** in ${state.hobby}.`,
          '',
          hook,
          '',
          `* **Understand the idea** — ${meaning}`,
          `* **Spot it in context** — recognize when ${name} applies during play or practice`,
          `* **Try a focused drill** — one short exercise you can repeat today`,
          `* **Avoid a common trap** — notice the mistake beginners make with ${name}`,
          '',
          `Why it matters: mastering **${name}** gives you a concrete skill you can use in casual ${state.hobby} sessions, not just theory.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} beginner illustration`,
      },
      {
        heading: `Understanding ${name}`,
        markdown: [
          meaning,
          '',
          `In ${state.hobby}, **${name}** is a building block you will reuse later. Start by naming the pieces involved and how they connect.`,
          '',
          `Keep the focus narrow: one clear definition, one visual or board example, and one reason this skill helps your goal.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} concept diagram`,
      },
      {
        heading: `A Clear Example of ${name}`,
        markdown: [
          `Walk through one concrete example of **${name}**. Describe the starting setup, the key decision, and the result.`,
          '',
          `1. Set up a simple position or scenario.`,
          `2. Apply the idea from **${name}** step by step.`,
          `3. Check the outcome against the lesson meaning.`,
          '',
          `If something feels unclear, slow down and restate the rule in your own words before continuing.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} worked example`,
      },
      {
        heading: `Practice ${name} Today`,
        markdown: [
          `Do a short practice focused only on **${name}**.`,
          '',
          `1. Spend 5–10 minutes on one drill tied to this lesson.`,
          `2. Say the key idea out loud before each attempt.`,
          `3. Note one mistake you caught and how you fixed it.`,
          '',
          `End with one real ${state.hobby} moment (a puzzle, position, or short game) where you deliberately use **${name}**.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} practice drill`,
      },
      {
        heading: `Common Mistakes with ${name}`,
        markdown: [
          `Beginners often rush **${name}** or mix it with a sibling skill.`,
          '',
          `Watch for: skipping the setup, guessing instead of checking, and practicing too fast to notice errors.`,
          '',
          `Fix: slow down, name the rule, then try one clean repetition.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} common mistake diagram`,
      },
      {
        heading: `Apply ${name} in a Short Session`,
        markdown: [
          `Close the loop by using **${name}** in a real ${state.hobby} session today.`,
          '',
          `Pick one situation where the lesson meaning applies, execute the idea once, then review what worked.`,
        ].join('\n'),
        imageQuery: `${state.hobby} ${name} real session application`,
      },
    ],
    videoQueries: [
      `${state.hobby} ${name} explained beginner`,
      `${state.hobby} ${name} example demo`,
      `${state.hobby} ${name} practice drill`,
    ],
    audioQuery: `${state.hobby} ${name} play along podcast`,
    keywords: [
      {
        name,
        description: meaning,
      },
      {
        name: 'Worked example',
        description: `A concrete walkthrough that shows ${name} in action.`,
      },
      {
        name: 'Focused drill',
        description: `A short practice loop that isolates ${name} before full play.`,
      },
      {
        name: 'Transfer',
        description: `Using ${name} in a real ${state.hobby} session after the drill.`,
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
    learnerContext: state.learnerContext,
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
    const hasVideoQuery =
      Boolean(parsed.data.videoQuery?.trim()) ||
      (parsed.data.videoQueries?.some((q) => q.trim()) ?? false);
    if (state.allowVideo && !hasVideoQuery) {
      errors.push('videoQuery or videoQueries is required');
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
  const usedImageUrls = new Set<string>();

  if (state.allowImages) {
    const queries = draft.pages
      .map((p) => ({ query: p.imageQuery, heading: p.heading }))
      .filter((p): p is { query: string; heading: string } => Boolean(p.query));

    // One image per page (cap at 6) so lessons aren't stuck with 1–3 lookalikes
    const toFetch =
      queries.length > 0
        ? queries.slice(0, 6)
        : [
            {
              query: `${state.hobby} ${state.sessionConfig.name}`,
              heading: state.sessionConfig.name,
            },
          ];

    for (const item of toFetch) {
      const asset = await resolveLessonImage({
        query: item.query,
        alt: item.heading,
        userId: state.userId,
        roadmapId: state.roadmapId,
        nodeId: state.nodeId,
        excludeUrls: usedImageUrls,
      });
      if (asset.source.sourceUrl) usedImageUrls.add(asset.source.sourceUrl);
      usedImageUrls.add(asset.url);
      media.push(asset);
    }
  } else {
    skipped.push('image');
  }

  if (state.allowVideo) {
    const videoQueries = [
      ...(draft.videoQueries ?? []),
      ...(draft.videoQuery ? [draft.videoQuery] : []),
    ]
      .map((q) => q.trim())
      .filter(Boolean);
    const uniqueQueries = [...new Set(videoQueries)];
    if (uniqueQueries.length === 0) {
      uniqueQueries.push(`${state.hobby} ${state.sessionConfig.name} tutorial`);
    }

    const usedVideoIds: string[] = [];
    for (const query of uniqueQueries.slice(0, 3)) {
      const video = await resolveYouTubeVideo(query, 'video', {
        hobby: state.hobby,
        lessonName: state.sessionConfig.name,
        excludeExternalIds: usedVideoIds,
      });
      if (video) {
        if (video.source.externalId) usedVideoIds.push(video.source.externalId);
        media.push(video);
      }
    }
    if (usedVideoIds.length === 0) {
      skipped.push('video');
    }
  } else {
    skipped.push('video');
  }

  if (state.allowAudio) {
    const audio = await resolveYouTubeVideo(
      draft.audioQuery ?? `${state.hobby} ${state.sessionConfig.name} play along`,
      'audio',
      { hobby: state.hobby, lessonName: state.sessionConfig.name },
    );
    if (audio) {
      media.push(audio);
    } else {
      skipped.push('audio');
    }
  } else {
    skipped.push('audio');
  }

  return { media, skippedModalities: skipped };
}

function videoPageIndexes(pageCount: number, videoCount: number): number[] {
  if (pageCount <= 0 || videoCount <= 0) return [];
  if (videoCount === 1) return [Math.min(1, pageCount - 1)];
  if (videoCount === 2) {
    return [Math.min(1, pageCount - 1), Math.min(Math.max(pageCount - 2, 2), pageCount - 1)];
  }
  return [
    Math.min(1, pageCount - 1),
    Math.min(Math.floor(pageCount / 2), pageCount - 1),
    Math.min(Math.max(pageCount - 2, 2), pageCount - 1),
  ].slice(0, videoCount);
}

function assemblePages(
  state: typeof LessonGenerationState.State,
): Partial<typeof LessonGenerationState.State> {
  if (!state.draft) {
    return { error: 'No draft to assemble' };
  }

  const images = state.media.filter((m) => m.kind === 'image');
  const videos = state.media.filter((m) => m.kind === 'video');
  const audio = state.media.find((m) => m.kind === 'audio');
  const videoAt = new Map<number, LessonMediaAsset>();
  videoPageIndexes(state.draft.pages.length, videos.length).forEach((pageIndex, i) => {
    const video = videos[i];
    if (video) videoAt.set(pageIndex, video);
  });

  const pages: LessonPage[] = state.draft.pages.map((page, index) => {
    const blocks: LessonPage['blocks'] = [
      { type: 'markdown', markdown: page.markdown },
    ];

    const image = images[index];
    if (image) {
      blocks.push({
        type: 'image',
        mediaId: image.id,
        caption: page.heading,
      });
    }

    const video = videoAt.get(index);
    if (video) {
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

  for (const video of videos) {
    if (!pages.some((p) => p.blocks.some((b) => b.type === 'video' && b.mediaId === video.id))) {
      pages[Math.min(1, pages.length - 1)]?.blocks.push({
        type: 'video',
        mediaId: video.id,
        caption: video.title,
      });
    }
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
    requireVideo: state.allowVideo && !state.skippedModalities.includes('video'),
    requireAudio: state.allowAudio && !state.skippedModalities.includes('audio'),
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
