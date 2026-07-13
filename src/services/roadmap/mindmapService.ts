import { createChildLogger } from '../../lib/logger';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { supabaseAdmin } from '../../lib/supabase';
import {
  roadmapMindMapSchema,
  type MindMapNode,
  type RoadmapMindMap,
} from '../../schemas/roadmapMindMap.schema';
import {
  buildSectionLessonMindMap,
  computeMindMapFingerprint,
  type LessonContext,
} from './mindmapHelpers';
import { countExercisesForRoadmap } from './exerciseService';

const log = createChildLogger({ module: 'roadmap-mindmap' });

const MIND_MAP_VERSION = 'hobbyflow-mind-map-v1';

type RoadmapRow = {
  id: string;
  title: string;
  lesson_plan_id: string | null;
  mindmap: RoadmapMindMap | null;
};

type NodeRow = {
  id: string;
  type: 'Section' | 'Lesson';
  name: string;
  metadata: Record<string, unknown>;
};

export { buildSectionLessonMindMap, buildFallbackMindMap, computeMindMapFingerprint } from './mindmapHelpers';

function buildLessonContexts(nodes: NodeRow[]): LessonContext[] {
  const sections = nodes
    .filter((n) => n.type === 'Section')
    .map((s) => ({
      id: s.id,
      name: s.name,
      sectionIndex: Number(s.metadata.sectionIndex ?? 0),
    }))
    .sort((a, b) => a.sectionIndex - b.sectionIndex);

  const sectionById = new Map(sections.map((s) => [s.id, s]));

  return nodes
    .filter((n) => n.type === 'Lesson')
    .map((lesson) => {
      const sectionId =
        typeof lesson.metadata.sectionId === 'string' ? lesson.metadata.sectionId : '';
      const section = sectionById.get(sectionId);
      return {
        id: lesson.id,
        name: lesson.name,
        hook: typeof lesson.metadata.hook === 'string' ? lesson.metadata.hook : '',
        meaning: typeof lesson.metadata.meaning === 'string' ? lesson.metadata.meaning : '',
        sectionId,
        sectionName: section?.name ?? 'Lessons',
        sectionIndex: section?.sectionIndex ?? Number(lesson.metadata.sectionIndex ?? 0),
        lessonIndex: Number(lesson.metadata.lessonIndex ?? 0),
      };
    })
    .sort((a, b) => a.sectionIndex - b.sectionIndex || a.lessonIndex - b.lessonIndex);
}

function withMetadata(
  tree: { title: string; root: MindMapNode },
  meta: {
    roadmapId: string;
    roadmapTitle: string;
    lessonCount: number;
    sectionCount: number;
    practiceCount: number;
    fingerprint: string;
  },
): RoadmapMindMap {
  return roadmapMindMapSchema.parse({
    title: tree.title,
    root: tree.root,
    metadata: {
      version: MIND_MAP_VERSION,
      createdAt: new Date().toISOString(),
      language: 'en',
      roadmapId: meta.roadmapId,
      roadmapTitle: meta.roadmapTitle,
      lessonCount: meta.lessonCount,
      sectionCount: meta.sectionCount,
      practiceCount: meta.practiceCount,
      knowledgeCardCount: 0,
      sourceFingerprint: meta.fingerprint,
      personalizationEnabled: false,
    },
  });
}

/**
 * Build or return a cached concept map: roadmap → sections → lessons.
 * Deterministic (no LLM).
 */
export async function generateOrGetMindMap(
  userId: string,
  roadmapId: string,
  options: { force?: boolean } = {},
): Promise<{ mindMap: RoadmapMindMap; cached: boolean }> {
  const { data: roadmap, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, lesson_plan_id, mindmap')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap');
  }
  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const row = roadmap as RoadmapRow;

  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, type, name, metadata')
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId);

  if (nodesError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap nodes');
  }

  const nodeRows = (nodes ?? []) as NodeRow[];
  const lessons = buildLessonContexts(nodeRows);
  const lessonIds = lessons.map((l) => l.id);

  if (lessonIds.length === 0) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Roadmap has no lessons to map');
  }

  const fingerprint = computeMindMapFingerprint(row.lesson_plan_id, lessonIds);
  const existing = row.mindmap;

  if (
    !options.force &&
    existing &&
    typeof existing === 'object' &&
    existing.metadata?.sourceFingerprint === fingerprint
  ) {
    const cached = roadmapMindMapSchema.safeParse(existing);
    if (cached.success) {
      const practiceCount = await countExercisesForRoadmap(userId, roadmapId);
      log.info({ roadmapId, fingerprint, practiceCount }, 'Mind map cache hit');
      return {
        mindMap: {
          ...cached.data,
          metadata: { ...cached.data.metadata, practiceCount },
        },
        cached: true,
      };
    }
  }

  const sectionCount = nodeRows.filter((n) => n.type === 'Section').length;
  const tree = buildSectionLessonMindMap(row.title, lessons);
  const practiceCount = await countExercisesForRoadmap(userId, roadmapId);

  const mindMap = withMetadata(tree, {
    roadmapId: row.id,
    roadmapTitle: row.title,
    lessonCount: lessonIds.length,
    sectionCount,
    practiceCount,
    fingerprint,
  });

  const { error: updateError } = await supabaseAdmin
    .from('roadmaps')
    .update({ mindmap: mindMap, updated_at: new Date().toISOString() })
    .eq('id', roadmapId)
    .eq('user_id', userId);

  if (updateError) {
    log.error({ err: updateError, roadmapId }, 'Failed to persist mind map');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to save mind map');
  }

  log.info(
    { roadmapId, fingerprint, lessonCount: lessonIds.length, cached: false },
    'Mind map built from sections',
  );

  return { mindMap, cached: false };
}
