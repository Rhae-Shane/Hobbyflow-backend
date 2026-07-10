import {
  assertLessonCoverage,
  collectLessonNodeIds,
  mindMapLlmOutputSchema,
  roadmapMindMapSchema,
  type MindMapNode,
} from '../src/schemas/roadmapMindMap.schema';
import {
  buildFallbackMindMap,
  computeMindMapFingerprint,
} from '../src/services/roadmap/mindmapHelpers';

const lessonA = '5e7d4f8c-e8a7-409c-85b0-90d27bfb9a0f';
const lessonB = 'b8c8d98f-c3b0-4d82-9c98-dddbad748a4f';
const lessonC = '1e7989cb-3c14-4fb4-befd-baca8e145301';

describe('roadmapMindMap.schema', () => {
  const validRoot: MindMapNode = {
    id: 'drumming-mastery-0',
    label: 'Drumming Mastery',
    lessonNodeIds: [lessonA, lessonB, lessonC],
    colorIndex: 0,
    children: [
      {
        id: 'rhythmic-language-0-0',
        label: 'Rhythmic Language',
        lessonNodeIds: [lessonA],
        colorIndex: 1,
        children: [
          {
            id: 'timing-pulse-0-0-0',
            label: 'Timing & Pulse',
            lessonNodeIds: [lessonA],
            colorIndex: 1,
            children: [],
          },
        ],
      },
      {
        id: 'physical-control-0-1',
        label: 'Physical Control',
        lessonNodeIds: [lessonB, lessonC],
        colorIndex: 1,
        children: [
          {
            id: 'hand-technique-0-1-0',
            label: 'Hand Technique',
            lessonNodeIds: [lessonB],
            colorIndex: 1,
            children: [],
          },
          {
            id: 'limb-independence-0-1-1',
            label: 'Limb Independence',
            lessonNodeIds: [lessonC],
            colorIndex: 1,
            children: [],
          },
        ],
      },
    ],
  };

  it('parses a valid mind map tree', () => {
    const parsed = roadmapMindMapSchema.parse({
      title: 'Drumming Foundations',
      root: validRoot,
      metadata: {
        version: 'hobbyflow-mind-map-v1',
        createdAt: '2026-07-10T13:06:37.149Z',
        language: 'en',
        roadmapId: '5a18a5ef-ccd4-491f-b05c-25b133a25575',
        roadmapTitle: 'Drumming Foundations for Beginners',
        lessonCount: 3,
        sectionCount: 2,
        practiceCount: 0,
        knowledgeCardCount: 0,
        sourceFingerprint: 'abc',
        personalizationEnabled: true,
      },
    });
    expect(parsed.root.children).toHaveLength(2);
    expect(collectLessonNodeIds(parsed.root).size).toBe(3);
  });

  it('rejects invalid llm output missing root', () => {
    const result = mindMapLlmOutputSchema.safeParse({ title: 'Only title' });
    expect(result.success).toBe(false);
  });

  it('assertLessonCoverage throws when lessons missing', () => {
    expect(() => assertLessonCoverage(validRoot, [lessonA, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])).toThrow(
      /missing lesson ids/,
    );
  });
});

describe('mindmapService helpers', () => {
  it('computes stable fingerprint', () => {
    const a = computeMindMapFingerprint('plan-1', [lessonB, lessonA]);
    const b = computeMindMapFingerprint('plan-1', [lessonA, lessonB]);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('builds fallback covering all lessons', () => {
    const tree = buildFallbackMindMap('Drumming Foundations for Beginners', [
      {
        id: lessonA,
        name: 'Keeping Time',
        hook: 'h',
        meaning: 'm',
        sectionId: 's1',
        sectionName: 'Rhythm Basics',
        sectionIndex: 0,
        lessonIndex: 0,
      },
      {
        id: lessonB,
        name: 'Hand Techniques',
        hook: 'h',
        meaning: 'm',
        sectionId: 's2',
        sectionName: 'Physical Control',
        sectionIndex: 1,
        lessonIndex: 0,
      },
    ]);
    expect(tree.title).toContain('Drumming');
    expect(() => assertLessonCoverage(tree.root, [lessonA, lessonB])).not.toThrow();
  });
});
