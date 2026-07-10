import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChildLogger } from '../../lib/logger';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { supabaseAdmin } from '../../lib/supabase';
import {
  assertLessonCoverage,
  mindMapLlmOutputSchema,
  roadmapMindMapSchema,
  type MindMapNode,
  type RoadmapMindMap,
} from '../../schemas/roadmapMindMap.schema';
import { invokeChatModel } from '../langgraph/llm';
import {
  buildFallbackMindMap,
  computeMindMapFingerprint,
  repairCoverage,
  type LessonContext,
} from './mindmapHelpers';

const log = createChildLogger({ module: 'roadmap-mindmap' });

const MIND_MAP_VERSION = 'hobbyflow-mind-map-v1';

type RoadmapRow = {
  id: string;
  title: string;
  lesson_plan_id: string | null;
  personalize_metadata: Record<string, unknown> | null;
  mindmap: RoadmapMindMap | null;
};

type NodeRow = {
  id: string;
  type: 'Section' | 'Lesson';
  name: string;
  metadata: Record<string, unknown>;
};

export { buildFallbackMindMap, computeMindMapFingerprint } from './mindmapHelpers';

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

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

function buildPrompt(input: {
  title: string;
  goal: string;
  background: string;
  lessons: LessonContext[];
}): string {
  const sectionsPayload = [...new Map(input.lessons.map((l) => [l.sectionId, l])).values()]
    .sort((a, b) => a.sectionIndex - b.sectionIndex)
    .map((section) => {
      const lessons = input.lessons.filter((l) => l.sectionId === section.sectionId);
      return {
        name: section.sectionName,
        lessons: lessons.map((l) => ({
          id: l.id,
          name: l.name,
          hook: l.hook,
          meaning: l.meaning,
        })),
      };
    });

  return `Build a concept mind map for a learning roadmap.

Roadmap title: ${input.title}
Learner goal: ${input.goal}
Background: ${input.background}

Sections and lessons (use these lesson UUIDs exactly in lessonNodeIds):
${JSON.stringify(sectionsPayload, null, 2)}

Return JSON only with this shape:
{
  "title": "short title",
  "root": {
    "id": "slug-0",
    "label": "Root Concept",
    "lessonNodeIds": ["uuid", "..."],
    "colorIndex": 0,
    "children": [
      {
        "id": "slug-0-0",
        "label": "Mid Concept",
        "lessonNodeIds": ["uuid"],
        "colorIndex": 1,
        "children": [
          {
            "id": "slug-0-0-0",
            "label": "Leaf Concept",
            "lessonNodeIds": ["uuid"],
            "colorIndex": 1,
            "children": []
          }
        ]
      }
    ]
  }
}

Rules:
- Exactly one root with 2-4 mid-level children; each mid node has 1-3 leaves (depth typically 2 under root)
- EVERY lesson UUID must appear in at least one lessonNodeIds array (root should include all)
- Prefer skill-theme grouping over copying section names 1:1 when a better concept tree fits
- Labels: short Title Case concept names, no emojis, no "course" wording
- colorIndex: root 0; first-level 1; second-level 1 or 2 alternating by branch
- ids: kebab-case slugs with numeric suffixes
- Return valid JSON only`;
}

async function invokeMindMapLlm(prompt: string): Promise<{ title: string; root: MindMapNode }> {
  const response = await invokeChatModel([
    new SystemMessage(
      'You design concept mind maps for learning roadmaps. Return valid JSON only. Never invent lesson UUIDs.',
    ),
    new HumanMessage(prompt),
  ]);
  const content =
    typeof response.content === 'string' ? response.content : String(response.content ?? '');
  const parsed = JSON.parse(extractJsonObject(content));
  return mindMapLlmOutputSchema.parse(parsed);
}

function withMetadata(
  tree: { title: string; root: MindMapNode },
  meta: {
    roadmapId: string;
    roadmapTitle: string;
    lessonCount: number;
    sectionCount: number;
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
      practiceCount: 0,
      knowledgeCardCount: 0,
      sourceFingerprint: meta.fingerprint,
      personalizationEnabled: true,
    },
  });
}

export async function generateOrGetMindMap(
  userId: string,
  roadmapId: string,
  options: { force?: boolean } = {},
): Promise<{ mindMap: RoadmapMindMap; cached: boolean }> {
  const { data: roadmap, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, lesson_plan_id, personalize_metadata, mindmap')
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
      log.info({ roadmapId, fingerprint }, 'Mind map cache hit');
      return { mindMap: cached.data, cached: true };
    }
  }

  const personalize = row.personalize_metadata ?? {};
  const goal =
    typeof personalize.learningGoal === 'string'
      ? personalize.learningGoal
      : typeof personalize.goal === 'string'
        ? personalize.goal
        : typeof personalize.suggestedGoal === 'string'
          ? personalize.suggestedGoal
          : row.title;
  const background =
    typeof personalize.backgroundLevel === 'string'
      ? personalize.backgroundLevel
      : typeof personalize.background === 'string'
        ? personalize.background
        : typeof personalize.suggestedBackground === 'string'
          ? personalize.suggestedBackground
          : '';

  const sectionCount = nodeRows.filter((n) => n.type === 'Section').length;
  let tree: { title: string; root: MindMapNode };

  try {
    tree = await invokeMindMapLlm(
      buildPrompt({ title: row.title, goal, background, lessons }),
    );
    tree = { ...tree, root: repairCoverage(tree.root, lessonIds) };
    assertLessonCoverage(tree.root, lessonIds);
  } catch (firstError) {
    log.warn({ err: firstError, roadmapId }, 'Mind map LLM failed — retrying once');
    try {
      tree = await invokeMindMapLlm(
        `${buildPrompt({ title: row.title, goal, background, lessons })}\n\nReturn valid JSON only. Cover every lesson UUID.`,
      );
      tree = { ...tree, root: repairCoverage(tree.root, lessonIds) };
      assertLessonCoverage(tree.root, lessonIds);
    } catch (secondError) {
      log.warn({ err: secondError, roadmapId }, 'Mind map LLM failed — using section fallback');
      tree = buildFallbackMindMap(row.title, lessons);
    }
  }

  const mindMap = withMetadata(tree, {
    roadmapId: row.id,
    roadmapTitle: row.title,
    lessonCount: lessonIds.length,
    sectionCount,
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
    'Mind map generated',
  );

  return { mindMap, cached: false };
}
