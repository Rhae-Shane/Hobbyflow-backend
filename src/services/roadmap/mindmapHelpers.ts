import { createHash } from 'crypto';
import { type MindMapNode } from '../../schemas/roadmapMindMap.schema';

export type LessonContext = {
  id: string;
  name: string;
  hook: string;
  meaning: string;
  sectionId: string;
  sectionName: string;
  sectionIndex: number;
  lessonIndex: number;
};

export function computeMindMapFingerprint(
  lessonPlanId: string | null,
  lessonIds: string[],
): string {
  const payload = `${lessonPlanId ?? ''}|${[...lessonIds].sort().join(',')}`;
  return createHash('sha256').update(payload).digest('hex');
}

function slugify(label: string, suffix: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'node'}-${suffix}`;
}

export function shortMindMapTitle(title: string): string {
  return title
    .replace(/\s+for\s+Beginners$/i, '')
    .replace(/\s+Foundations$/i, ' Foundations')
    .trim()
    .slice(0, 60);
}

/** Deterministic tree: roadmap root → sections → lessons. */
export function buildSectionLessonMindMap(
  title: string,
  lessons: LessonContext[],
): { title: string; root: MindMapNode } {
  const mapTitle = shortMindMapTitle(title);
  const rootLabel = mapTitle.split(' ').slice(0, 3).join(' ') || 'Roadmap';
  const bySection = new Map<string, LessonContext[]>();

  for (const lesson of lessons) {
    const key = `${lesson.sectionIndex}:${lesson.sectionName}`;
    const list = bySection.get(key) ?? [];
    list.push(lesson);
    bySection.set(key, list);
  }

  const children: MindMapNode[] = [...bySection.entries()].map(([, sectionLessons], i) => {
    const sectionName = sectionLessons[0]?.sectionName ?? 'Section';
    const colorIndex = i % 2 === 0 ? 1 : 2;
    const leaves: MindMapNode[] = sectionLessons.map((lesson, j) => ({
      id: slugify(lesson.name, `0-${i}-${j}`),
      label: lesson.name,
      lessonNodeIds: [lesson.id],
      colorIndex,
      children: [],
    }));

    return {
      id: slugify(sectionName, `0-${i}`),
      label: sectionName,
      lessonNodeIds: sectionLessons.map((l) => l.id),
      colorIndex,
      children: leaves,
    };
  });

  return {
    title: mapTitle,
    root: {
      id: slugify(rootLabel, '0'),
      label: rootLabel,
      lessonNodeIds: lessons.map((l) => l.id),
      colorIndex: 0,
      children,
    },
  };
}

/** @deprecated Use buildSectionLessonMindMap */
export const buildFallbackMindMap = buildSectionLessonMindMap;
