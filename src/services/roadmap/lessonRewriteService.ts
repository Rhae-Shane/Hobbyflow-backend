import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import { invokeChatModel } from '../langgraph/llm';

const log = createChildLogger({ module: 'lessonRewriteService' });

const lessonMetaSchema = z.object({
  name: z.string().trim().min(3).max(120),
  hook: z.string().trim().min(3).max(200),
  meaning: z.string().trim().min(3).max(280),
});

const sectionRewriteSchema = z.object({
  sectionName: z.string().trim().min(3).max(120),
  lessons: z
    .array(
      z.object({
        lessonId: z.string().uuid(),
        name: z.string().trim().min(3).max(120),
        hook: z.string().trim().min(3).max(200),
        meaning: z.string().trim().min(3).max(280),
      }),
    )
    .min(1),
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

async function loadHobbyName(hobbyId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('hobbies').select('name').eq('id', hobbyId).maybeSingle();
  return (data?.name as string | undefined) ?? 'hobby';
}

type SiblingSectionSummary = {
  sectionName: string;
  lessonNames: string[];
};

/**
 * Other sections on the roadmap (excluding `excludeSectionId`), each with lesson titles only.
 * Ordered by sectionIndex when present.
 */
async function loadSiblingSections(input: {
  roadmapId: string;
  userId: string;
  excludeSectionId?: string;
}): Promise<SiblingSectionSummary[]> {
  const { data: sectionNodes } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('roadmap_id', input.roadmapId)
    .eq('user_id', input.userId)
    .eq('type', 'Section');

  const sections = (sectionNodes ?? [])
    .filter((s) => s.id !== input.excludeSectionId)
    .map((s) => {
      const meta = (s.metadata ?? {}) as { sectionIndex?: number };
      return {
        id: s.id as string,
        name: (s.name as string) || 'Section',
        sectionIndex: typeof meta.sectionIndex === 'number' ? meta.sectionIndex : 999,
      };
    })
    .sort((a, b) => a.sectionIndex - b.sectionIndex);

  if (sections.length === 0) return [];

  const { data: lessonNodes } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('roadmap_id', input.roadmapId)
    .eq('user_id', input.userId)
    .eq('type', 'Lesson');

  return sections.map((section) => {
    const lessonNames = (lessonNodes ?? [])
      .filter((n) => {
        const meta = (n.metadata ?? {}) as { sectionId?: string; lessonIndex?: number };
        return meta.sectionId === section.id;
      })
      .sort((a, b) => {
        const ai = ((a.metadata ?? {}) as { lessonIndex?: number }).lessonIndex ?? 0;
        const bi = ((b.metadata ?? {}) as { lessonIndex?: number }).lessonIndex ?? 0;
        return ai - bi;
      })
      .map((n) => (n.name as string) || 'Lesson')
      .filter(Boolean);

    return {
      sectionName: section.name,
      lessonNames,
    };
  });
}

export type SessionConfig = { name: string; hook: string; meaning: string };

/**
 * LLM rewrite of a single lesson title/hook/meaning, then persist to lesson + node.
 */
export async function rewriteLessonSessionConfig(input: {
  userId: string;
  roadmapId: string;
  lessonId: string;
}): Promise<SessionConfig> {
  const { data: lesson, error: lessonError } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, roadmap_id, node_id, user_id, status, session_config')
    .eq('id', input.lessonId)
    .eq('roadmap_id', input.roadmapId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (lessonError || !lesson) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson not found');
  }
  if (lesson.status === 'skipped') {
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Skipped lessons cannot be rewritten');
  }

  const { data: roadmap } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, hobby_id, personalize_metadata')
    .eq('id', input.roadmapId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const { data: node } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('id', lesson.node_id)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!node) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson node not found');
  }

  const hobby = await loadHobbyName(roadmap.hobby_id as string);
  const personalize = (roadmap.personalize_metadata ?? {}) as {
    learningGoal?: string;
    backgroundLevel?: string;
  };
  const current = (lesson.session_config ?? {}) as Partial<SessionConfig>;
  const nodeMeta = (node.metadata ?? {}) as { sectionId?: string };
  const currentSectionId = nodeMeta.sectionId;

  const { data: siblings } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('name, metadata')
    .eq('roadmap_id', input.roadmapId)
    .eq('type', 'Lesson')
    .neq('id', node.id);

  // Prefer same-section siblings; fall back to all other lesson names
  const sameSectionSiblings = (siblings ?? [])
    .filter((s) => {
      const meta = (s.metadata ?? {}) as { sectionId?: string };
      return currentSectionId ? meta.sectionId === currentSectionId : true;
    })
    .map((s) => s.name as string)
    .filter(Boolean);

  const siblingNames =
    sameSectionSiblings.length > 0
      ? sameSectionSiblings
      : (siblings ?? []).map((s) => s.name as string).filter(Boolean);

  const siblingSections = await loadSiblingSections({
    roadmapId: input.roadmapId,
    userId: input.userId,
    excludeSectionId: currentSectionId,
  });

  const response = await invokeChatModel([
    new SystemMessage(
      [
        'You rewrite HobbyFlow lesson metadata for the same skill focus.',
        'Return ONLY JSON: {"name":"...","hook":"...","meaning":"..."}.',
        'name: short lesson title. hook: curiosity question. meaning: one sentence why it matters.',
        'Stay on the same hobby and learning goal. Do not invent a different topic.',
        'Respect sibling sections and their lesson names — do not collide with or steal their topics.',
        'Avoid programming/CS unless the hobby is programming.',
      ].join(' '),
    ),
    new HumanMessage(
      JSON.stringify(
        {
          hobby,
          roadmapTitle: roadmap.title,
          learningGoal: personalize.learningGoal ?? null,
          backgroundLevel: personalize.backgroundLevel ?? null,
          current: {
            name: current.name ?? node.name,
            hook: current.hook ?? '',
            meaning: current.meaning ?? '',
          },
          siblingLessonsInSection: siblingNames,
          siblingSections,
          instruction:
            'Propose a fresh but equivalent title, hook, and meaning for this lesson. Use siblingSections only for context so topics stay distinct.',
        },
        null,
        2,
      ),
    ),
  ]);

  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const parsed = lessonMetaSchema.parse(JSON.parse(extractJsonObject(raw)));

  const { error: lessonUpdateError } = await supabaseAdmin
    .from('roadmap_lessons')
    .update({
      session_config: parsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lesson.id)
    .eq('user_id', input.userId);

  if (lessonUpdateError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to update lesson metadata');
  }

  const prevMeta =
    node.metadata && typeof node.metadata === 'object'
      ? (node.metadata as Record<string, unknown>)
      : {};

  const { error: nodeUpdateError } = await supabaseAdmin
    .from('roadmap_nodes')
    .update({
      name: parsed.name,
      metadata: { ...prevMeta, hook: parsed.hook, meaning: parsed.meaning },
      updated_at: new Date().toISOString(),
    })
    .eq('id', node.id)
    .eq('user_id', input.userId);

  if (nodeUpdateError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to update lesson node');
  }

  log.info({ lessonId: lesson.id, name: parsed.name }, 'Lesson session config rewritten');
  return parsed;
}

export type SectionRegenerateResult = {
  sectionId: string;
  sectionName: string;
  lessonIds: string[];
};

/**
 * Rewrite a section title and all nested lesson titles/hooks/meanings.
 * Clears generated pages and sets lessons back to pending_content (except skipped).
 */
export async function regenerateSectionOutline(input: {
  userId: string;
  roadmapId: string;
  sectionId: string;
}): Promise<SectionRegenerateResult> {
  const { data: section, error: sectionError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, type, roadmap_id, user_id')
    .eq('id', input.sectionId)
    .eq('roadmap_id', input.roadmapId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (sectionError || !section || section.type !== 'Section') {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Section not found');
  }

  const { data: roadmap } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, hobby_id, personalize_metadata')
    .eq('id', input.roadmapId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const { data: lessonNodes } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('roadmap_id', input.roadmapId)
    .eq('type', 'Lesson')
    .eq('user_id', input.userId);

  const sectionLessons = (lessonNodes ?? []).filter((n) => {
    const meta = (n.metadata ?? {}) as { sectionId?: string };
    return meta.sectionId === input.sectionId;
  });

  if (sectionLessons.length === 0) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Section has no lessons');
  }

  const { data: lessonRows } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, node_id, status, session_config, path_order')
    .eq('roadmap_id', input.roadmapId)
    .eq('user_id', input.userId)
    .in(
      'node_id',
      sectionLessons.map((n) => n.id),
    )
    .order('path_order', { ascending: true });

  const activeLessons = (lessonRows ?? []).filter((l) => l.status !== 'skipped');
  if (activeLessons.length === 0) {
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'No active lessons to regenerate in section');
  }

  const hobby = await loadHobbyName(roadmap.hobby_id as string);
  const personalize = (roadmap.personalize_metadata ?? {}) as {
    learningGoal?: string;
    backgroundLevel?: string;
  };

  const payloadLessons = activeLessons.map((row) => {
    const node = sectionLessons.find((n) => n.id === row.node_id);
    const cfg = (row.session_config ?? {}) as Partial<SessionConfig>;
    return {
      lessonId: row.id as string,
      name: cfg.name ?? (node?.name as string) ?? 'Lesson',
      hook: cfg.hook ?? '',
      meaning: cfg.meaning ?? '',
    };
  });

  const siblingSections = await loadSiblingSections({
    roadmapId: input.roadmapId,
    userId: input.userId,
    excludeSectionId: input.sectionId,
  });

  const response = await invokeChatModel([
    new SystemMessage(
      [
        'You rewrite one HobbyFlow roadmap section and its lessons.',
        'Return ONLY JSON:',
        '{"sectionName":"...","lessons":[{"lessonId":"uuid","name":"...","hook":"...","meaning":"..."}]}',
        'Keep the same lessonIds. Keep the same skill progression. Fresh wording only.',
        'Stay on the hobby. Do not invent programming content unless the hobby is programming.',
        'Use siblingSections (names + their lesson titles only) for context — do not duplicate their topics.',
      ].join(' '),
    ),
    new HumanMessage(
      JSON.stringify(
        {
          hobby,
          roadmapTitle: roadmap.title,
          learningGoal: personalize.learningGoal ?? null,
          currentSectionName: section.name,
          lessons: payloadLessons,
          siblingSections,
          instruction:
            'Rewrite section name and every lesson name/hook/meaning. Keep this section distinct from siblingSections.',
        },
        null,
        2,
      ),
    ),
  ]);

  const raw =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const parsed = sectionRewriteSchema.parse(JSON.parse(extractJsonObject(raw)));

  const allowedIds = new Set(payloadLessons.map((l) => l.lessonId));
  for (const lesson of parsed.lessons) {
    if (!allowedIds.has(lesson.lessonId)) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Rewrite returned unknown lesson id');
    }
  }

  const { error: sectionUpdateError } = await supabaseAdmin
    .from('roadmap_nodes')
    .update({ name: parsed.sectionName, updated_at: new Date().toISOString() })
    .eq('id', section.id)
    .eq('user_id', input.userId);

  if (sectionUpdateError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to update section name');
  }

  for (const lesson of parsed.lessons) {
    const row = activeLessons.find((l) => l.id === lesson.lessonId);
    if (!row) continue;

    await supabaseAdmin
      .from('roadmap_lessons')
      .update({
        session_config: {
          name: lesson.name,
          hook: lesson.hook,
          meaning: lesson.meaning,
        },
        status: 'pending_content',
        updated_at: new Date().toISOString(),
      })
      .eq('id', lesson.lessonId)
      .eq('user_id', input.userId);

    const node = sectionLessons.find((n) => n.id === row.node_id);
    const prevMeta =
      node?.metadata && typeof node.metadata === 'object'
        ? (node.metadata as Record<string, unknown>)
        : {};

    await supabaseAdmin
      .from('roadmap_nodes')
      .update({
        name: lesson.name,
        content: { concepts: [], sourceContent: '', pages: [] },
        metadata: { ...prevMeta, hook: lesson.hook, meaning: lesson.meaning },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.node_id)
      .eq('user_id', input.userId);
  }

  log.info(
    {
      sectionId: section.id,
      sectionName: parsed.sectionName,
      lessonCount: parsed.lessons.length,
    },
    'Section outline regenerated',
  );

  return {
    sectionId: section.id as string,
    sectionName: parsed.sectionName,
    lessonIds: parsed.lessons.map((l) => l.lessonId),
  };
}
