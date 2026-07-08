import type { Modality } from '../../types/plan.types';

const HOBBY_MODALITIES: Record<string, Modality[]> = {
  chess: ['video', 'article', 'interactive'],
  guitar: ['video', 'article', 'audio'],
  poker: ['video', 'article', 'audio'],
  photography: ['video', 'article', 'interactive'],
};

const DEFAULT_MODALITIES: Modality[] = ['video', 'article'];

export function getAllowedModalities(hobby: string): Modality[] {
  const key = hobby.trim().toLowerCase();
  return HOBBY_MODALITIES[key] ?? DEFAULT_MODALITIES;
}

export function clampModality(hobby: string, modality: Modality): Modality {
  const allowed = getAllowedModalities(hobby);
  return allowed.includes(modality) ? modality : (allowed[0] ?? 'video');
}

export function applyModalityRules<T extends { modality: Modality }>(
  hobby: string,
  techniques: T[],
): T[] {
  return techniques.map((t) => ({
    ...t,
    modality: clampModality(hobby, t.modality),
  }));
}
