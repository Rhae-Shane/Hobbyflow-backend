import type { Modality } from '../../types/plan.types';
import {
  enrichSearchQueryForModality,
  getAccessibilityAllowedModalities,
  parseAccessibilityConstraints,
  pickAccessibleModality,
} from './learnerAccessibility';

const HOBBY_MODALITIES: Record<string, Modality[]> = {
  chess: ['video', 'article', 'interactive'],
  guitar: ['video', 'article', 'audio'],
  poker: ['video', 'article', 'audio'],
  photography: ['video', 'article', 'interactive'],
};

const DEFAULT_MODALITIES: Modality[] = ['video', 'article'];

function getBaseModalities(hobby: string): Modality[] {
  const key = hobby.trim().toLowerCase();
  return HOBBY_MODALITIES[key] ?? DEFAULT_MODALITIES;
}

export function getAllowedModalities(hobby: string, learnerContext?: string): Modality[] {
  const baseModalities = getBaseModalities(hobby);
  const constraints = parseAccessibilityConstraints(learnerContext);
  const accessibleModalities = getAccessibilityAllowedModalities(baseModalities, constraints);

  if (!constraints) {
    return accessibleModalities;
  }

  const expanded = new Set<Modality>(accessibleModalities);
  for (const modality of constraints.preferredModalities) {
    if (!constraints.forbiddenModalities.includes(modality)) {
      expanded.add(modality);
    }
  }

  return [...expanded];
}

export function clampModality(
  hobby: string,
  modality: Modality,
  learnerContext?: string,
): Modality {
  const allowed = getAllowedModalities(hobby, learnerContext);
  return allowed.includes(modality) ? modality : pickAccessibleModality(allowed, parseAccessibilityConstraints(learnerContext));
}

export function applyModalityRules<T extends { modality: Modality; searchQuery: string }>(
  hobby: string,
  techniques: T[],
  learnerContext?: string,
): T[] {
  const constraints = parseAccessibilityConstraints(learnerContext);
  const allowed = getAllowedModalities(hobby, learnerContext);

  return techniques.map((technique) => {
    let modality = clampModality(hobby, technique.modality, learnerContext);
    let searchQuery = technique.searchQuery;

    if (constraints?.forbiddenModalities.includes(modality)) {
      modality = pickAccessibleModality(allowed, constraints);
      searchQuery = enrichSearchQueryForModality(searchQuery, modality, constraints);
    } else if (
      constraints &&
      !allowed.includes(technique.modality) &&
      modality !== technique.modality
    ) {
      searchQuery = enrichSearchQueryForModality(searchQuery, modality, constraints);
    }

    return {
      ...technique,
      modality,
      searchQuery,
    };
  });
}
