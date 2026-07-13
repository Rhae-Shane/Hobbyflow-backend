import { randomUUID } from 'crypto';
import { traceable } from 'langsmith/traceable';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import {
  sanitizeLessonContentForClient,
  type GenerateLessonResponse,
  type LessonNodeContent,
} from '../../schemas/lessonContent.schema';
import { getAllowedModalities } from '../planner/modalityRules';
import {
  createLessonGenerationGraph,
  initialStateFromInput,
} from '../langgraph/graphs/lessonGenerationGraph';
import { rewriteLessonSessionConfig } from './lessonRewriteService';
const log = createChildLogger({ module: 'lessonGenerationService' });

const GENERATING_STALE_MS = 2 * 60 * 1000;

type LessonRow = {
  id: string;
  roadmap_id: string;
  node_id: string;
  user_id: string;
  status: string;
  updated_at: string;
  session_config: { name?: string; hook?: string; meaning?: string };
};

type NodeRow = {
  id: string;
  content: LessonNodeContent | Record<string, unknown>;
  name: string;
};

function hasReadyPages(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const pages = (content as { pages?: unknown }).pages;
  return Array.isArray(pages) && pages.length > 0;
}

async function loadHobbyName(hobbyId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('hobbies')
    .select('name')
    .eq('id', hobbyId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? 'hobby';
}

export async function generateLessonContent(
  userId: string,
  roadmapId: string,
  lessonId: string,
  options: { force?: boolean; rewriteSession?: boolean } = {},
): Promise<GenerateLessonResponse> {
  const rewriteSession = options.rewriteSession === true;
  const force = options.force === true || rewriteSession;
  const startedAtMs = Date.now();
  const requestGroupId = randomUUID();

  if (rewriteSession) {
    await rewriteLessonSessionConfig({ userId, roadmapId, lessonId });
  }
  const { data: lesson, error: lessonError } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, roadmap_id, node_id, user_id, status, updated_at, session_config')
    .eq('id', lessonId)
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (lessonError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load lesson');
  }
  if (!lesson) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson not found');
  }

  const lessonRow = lesson as LessonRow;

  const { data: node, error: nodeError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, content, name')
    .eq('id', lessonRow.node_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (nodeError || !node) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson node not found');
  }

  const nodeRow = node as NodeRow;

  if (
    !force &&
    (lessonRow.status === 'ready' || lessonRow.status === 'in_progress' || lessonRow.status === 'completed') &&
    hasReadyPages(nodeRow.content)
  ) {
    return {
      status: 'success',
      message: 'Lesson already generated',
      lessonId: lessonRow.id,
      nodeId: nodeRow.id,
      requestGroupId,
      generationDurationMs: 0,
    };
  }

  if (lessonRow.status === 'generating' && !force) {
    const updatedAt = new Date(lessonRow.updated_at).getTime();
    if (Date.now() - updatedAt < GENERATING_STALE_MS) {
      return {
        status: 'generating',
        message: 'Lesson generation already in progress',
        lessonId: lessonRow.id,
        nodeId: nodeRow.id,
        requestGroupId,
      };
    }
  }

  if (lessonRow.status === 'skipped') {
    throw new AppError(
      409,
      ErrorCodes.VALIDATION_ERROR,
      'Skipped lessons cannot be regenerated. Un-skip is not supported; pick another lesson.',
    );
  }

  if (!['pending_content', 'failed', 'generating', 'ready'].includes(lessonRow.status) && !force) {
    throw new AppError(
      409,
      ErrorCodes.VALIDATION_ERROR,
      `Cannot generate lesson in status ${lessonRow.status}`,
    );
  }

  const { error: lockError } = await supabaseAdmin
    .from('roadmap_lessons')
    .update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', lessonRow.id)
    .eq('user_id', userId);

  if (lockError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to lock lesson for generation');
  }

  const { data: roadmap } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, hobby_id, personalize_metadata')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!roadmap) {
    await markFailed(lessonRow.id, userId);
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const hobby = await loadHobbyName(roadmap.hobby_id as string);
  const personalize = (roadmap.personalize_metadata ?? {}) as {
    learningGoal?: string;
    backgroundLevel?: string;
    learnerContextSummary?: string;
  };

  const { data: siblingNodes } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('name, type')
    .eq('roadmap_id', roadmapId)
    .eq('type', 'Lesson');

  const siblingLessonNames = (siblingNodes ?? [])
    .map((n) => n.name as string)
    .filter((name) => name && name !== nodeRow.name);

  const learnerContext = personalize.learnerContextSummary ?? '';
  const allowed = getAllowedModalities(hobby, learnerContext);
  const allowVideo = allowed.includes('video');
  const allowAudio = allowed.includes('audio');
  const allowImages = true;

  try {
    const graph = createLessonGenerationGraph();
    const result = await graph.invoke(
      initialStateFromInput({
        userId,
        roadmapId,
        lessonId: lessonRow.id,
        nodeId: nodeRow.id,
        hobby,
        learnerContext,
        sessionConfig: {
          name: lessonRow.session_config?.name ?? nodeRow.name,
          hook: lessonRow.session_config?.hook ?? '',
          meaning: lessonRow.session_config?.meaning ?? '',
        },
        personalize: {
          learningGoal: personalize.learningGoal,
          backgroundLevel: personalize.backgroundLevel,
        },
        roadmapTitle: roadmap.title as string,
        siblingLessonNames,
        allowVideo,
        allowAudio,
        allowImages,
        requestGroupId,
        startedAtMs,
      }),
      {
        runName: `lesson-generation:${lessonRow.id}`,
        tags: ['lesson-generation'],
        metadata: { userId, roadmapId, lessonId: lessonRow.id },
      },
    );

    if (result.error || !result.content) {
      await markFailed(lessonRow.id, userId);
      log.warn({ lessonId: lessonRow.id, error: result.error }, 'Lesson generation failed');
      return {
        status: 'failed',
        message: 'Lesson generation failed',
        lessonId: lessonRow.id,
        nodeId: nodeRow.id,
        requestGroupId,
        generationDurationMs: Date.now() - startedAtMs,
        error: {
          code: 'LESSON_GENERATION_FAILED',
          message: result.error ?? 'Unknown generation error',
        },
      };
    }

    // Persist full content (with searchQuery provenance) server-side
    const { error: contentError } = await supabaseAdmin
      .from('roadmap_nodes')
      .update({
        content: result.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', nodeRow.id)
      .eq('user_id', userId);

    if (contentError) {
      await markFailed(lessonRow.id, userId);
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to save lesson content');
    }

    const { error: statusError } = await supabaseAdmin
      .from('roadmap_lessons')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', lessonRow.id)
      .eq('user_id', userId);

    if (statusError) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to mark lesson ready');
    }

    // Validate client sanitization path (ensures no searchQuery leak in typed public shape)
    sanitizeLessonContentForClient(result.content);

    log.info(
      {
        lessonId: lessonRow.id,
        durationMs: Date.now() - startedAtMs,
        pageCount: result.content.pages.length,
        mediaCount: result.content.media.length,
      },
      'Lesson generation completed',
    );

    return {
      status: 'success',
      message: 'Lesson generation completed',
      lessonId: lessonRow.id,
      nodeId: nodeRow.id,
      requestGroupId,
      generationDurationMs: Date.now() - startedAtMs,
    };
  } catch (error) {
    await markFailed(lessonRow.id, userId);
    if (error instanceof AppError) throw error;
    log.error({ err: error, lessonId: lessonRow.id }, 'Lesson generation threw');
    throw new AppError(
      500,
      ErrorCodes.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Lesson generation failed',
    );
  }
}

async function markFailed(lessonId: string, userId: string): Promise<void> {
  await supabaseAdmin
    .from('roadmap_lessons')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('user_id', userId);
}

export const generateLessonContentTraced = traceable(generateLessonContent, {
  name: 'lesson-generation',
  run_type: 'chain',
});
