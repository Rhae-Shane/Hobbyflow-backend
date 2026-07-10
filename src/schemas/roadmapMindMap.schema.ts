import { z } from 'zod';

export const mindMapNodeSchema: z.ZodType<MindMapNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(120),
    label: z.string().min(1).max(80),
    lessonNodeIds: z.array(z.string().uuid()),
    colorIndex: z.number().int().min(0).max(8).optional(),
    children: z.array(mindMapNodeSchema),
  }),
);

export type MindMapNode = {
  id: string;
  label: string;
  lessonNodeIds: string[];
  colorIndex?: number;
  children: MindMapNode[];
};

/** LLM returns title + root; server fills metadata. */
export const mindMapLlmOutputSchema = z.object({
  title: z.string().min(1).max(120),
  root: mindMapNodeSchema,
});

export const mindMapMetadataSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  language: z.string(),
  roadmapId: z.string().uuid(),
  roadmapTitle: z.string(),
  lessonCount: z.number().int().nonnegative(),
  sectionCount: z.number().int().nonnegative(),
  practiceCount: z.number().int().nonnegative(),
  knowledgeCardCount: z.number().int().nonnegative(),
  sourceFingerprint: z.string().min(1),
  personalizationEnabled: z.boolean(),
});

export const roadmapMindMapSchema = z.object({
  title: z.string().min(1).max(120),
  root: mindMapNodeSchema,
  metadata: mindMapMetadataSchema,
});

export type RoadmapMindMap = z.infer<typeof roadmapMindMapSchema>;

export const generateMindMapRequestSchema = z.object({
  force: z.boolean().optional(),
});

export type GenerateMindMapRequest = z.infer<typeof generateMindMapRequestSchema>;

export const generateMindMapResponseSchema = z.object({
  mindMap: roadmapMindMapSchema,
});

export type GenerateMindMapResponse = z.infer<typeof generateMindMapResponseSchema>;

export function collectLessonNodeIds(node: MindMapNode): Set<string> {
  const ids = new Set<string>(node.lessonNodeIds);
  for (const child of node.children) {
    for (const id of collectLessonNodeIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}

export function assertLessonCoverage(root: MindMapNode, expectedLessonIds: string[]): void {
  const covered = collectLessonNodeIds(root);
  const missing = expectedLessonIds.filter((id) => !covered.has(id));
  if (missing.length > 0) {
    throw new Error(`Mind map missing lesson ids: ${missing.join(', ')}`);
  }
}
