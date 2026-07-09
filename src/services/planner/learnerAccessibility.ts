import type { Modality } from '../../types/plan.types';

export type AccessibilityConstraints = {
  forbiddenModalities: Modality[];
  preferredModalities: Modality[];
  promptLines: string[];
};

const BLINDNESS_LABEL = 'Blindness';
const DEAFNESS_LABEL = 'Hearing impairment / deafness';
const LOW_VISION_LABEL = 'Vision impairment / low vision';

function hasAccessibilityLabel(learnerContext: string, label: string): boolean {
  return new RegExp(`^-\\s*${escapeRegExp(label)}(?:\\s*:|$)`, 'im').test(learnerContext);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseAccessibilityConstraints(
  learnerContext?: string,
): AccessibilityConstraints | null {
  if (!learnerContext?.trim()) {
    return null;
  }

  const isBlind = hasAccessibilityLabel(learnerContext, BLINDNESS_LABEL);
  const isDeaf = hasAccessibilityLabel(learnerContext, DEAFNESS_LABEL);
  const hasLowVision = hasAccessibilityLabel(learnerContext, LOW_VISION_LABEL);

  if (!isBlind && !isDeaf && !hasLowVision) {
    return null;
  }

  const forbiddenModalities = new Set<Modality>();
  const preferredModalities: Modality[] = [];
  const promptLines: string[] = [
    '- Accessibility needs override preferred content format when they conflict.',
  ];

  if (isBlind) {
    forbiddenModalities.add('video');
    forbiddenModalities.add('interactive');
    preferredModalities.push('audio', 'article');
    promptLines.push(
      '- ACCESSIBILITY (mandatory): Learner is blind — never assign video or interactive modalities.',
      '- Use audio and article only. Favor podcasts, guided audio drills, and descriptive written walkthroughs.',
      '- search_query must target listenable or screen-reader-friendly resources — not visual demos.',
    );
  }

  if (isDeaf) {
    forbiddenModalities.add('audio');
    preferredModalities.push('video', 'article');
    promptLines.push(
      '- ACCESSIBILITY (mandatory): Learner has hearing impairment — never assign audio modality.',
      '- Prefer captioned video and text guides with clear visual steps.',
    );
  }

  if (hasLowVision && !isBlind) {
    preferredModalities.push('audio', 'article', 'video');
    promptLines.push(
      '- Favor high-contrast text, audio alternatives, and clearly described visual demos.',
    );
  }

  return {
    forbiddenModalities: [...forbiddenModalities],
    preferredModalities,
    promptLines,
  };
}

export function getAccessibilityAllowedModalities(
  hobbyModalities: Modality[],
  constraints: AccessibilityConstraints | null,
): Modality[] {
  if (!constraints) {
    return hobbyModalities;
  }

  const filtered = hobbyModalities.filter(
    (modality) => !constraints.forbiddenModalities.includes(modality),
  );

  if (filtered.length > 0) {
    return filtered;
  }

  return constraints.preferredModalities.length > 0
    ? constraints.preferredModalities
    : hobbyModalities;
}

export function pickAccessibleModality(
  allowedModalities: Modality[],
  constraints: AccessibilityConstraints | null,
): Modality {
  if (constraints) {
    const preferred = constraints.preferredModalities.find((modality) =>
      allowedModalities.includes(modality),
    );
    if (preferred) {
      return preferred;
    }
  }

  return allowedModalities[0] ?? 'article';
}

export function enrichSearchQueryForModality(
  searchQuery: string,
  modality: Modality,
  constraints: AccessibilityConstraints | null,
): string {
  const normalized = searchQuery.trim();
  const lower = normalized.toLowerCase();

  if (modality === 'audio') {
    if (lower.includes('podcast') || lower.includes('audio')) {
      return normalized;
    }
    return `${normalized} audio guide podcast`;
  }

  if (
    modality === 'article' &&
    constraints?.forbiddenModalities.includes('video')
  ) {
    if (lower.includes('written') || lower.includes('step by step')) {
      return normalized;
    }
    return `${normalized} step by step written guide`;
  }

  return normalized;
}

export function rawPlanViolatesAccessibility(
  techniques: { modality?: Modality }[],
  constraints: AccessibilityConstraints,
): boolean {
  return techniques.some((technique) =>
    constraints.forbiddenModalities.includes((technique.modality ?? 'video') as Modality),
  );
}

export function planViolatesAccessibility(
  techniques: { modality: Modality }[],
  constraints: AccessibilityConstraints,
): boolean {
  return techniques.some((technique) =>
    constraints.forbiddenModalities.includes(technique.modality),
  );
}

export function buildAccessibilityRetryHint(constraints: AccessibilityConstraints): string {
  const forbidden = constraints.forbiddenModalities.join(', ');
  const preferred = constraints.preferredModalities.join(', ');

  return [
    'CORRECTION (mandatory): The previous roadmap violated accessibility constraints.',
    `Never use these modalities: ${forbidden}.`,
    preferred ? `Use only: ${preferred}.` : '',
    'Regenerate the full roadmap with compliant modalities and search_query values.',
  ]
    .filter(Boolean)
    .join(' ');
}
