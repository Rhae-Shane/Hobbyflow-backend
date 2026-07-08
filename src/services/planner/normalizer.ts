import type { Modality, Technique } from '../../types/plan.types';
import type { RawPlanResponse } from './validator';
import { getTrustedCreator } from './trustedCreators';

export function normalizeTechniques(
  raw: RawPlanResponse,
  hobby: string,
): Omit<Technique, 'modality'>[] & { modality: Modality }[] {
  return raw.techniques.map((t) => {
    const creator = getTrustedCreator(hobby);
    const baseQuery = t.search_query ?? `${hobby} ${t.name} explained`;
    const searchQuery = creator ? `${creator} ${baseQuery}` : baseQuery;

    return {
      id: `t${t.order}`,
      name: t.name,
      why: t.why?.trim() || `Technique in your ${hobby} roadmap.`,
      order: t.order,
      modality: (t.modality ?? 'video') as Modality,
      estimatedMinutes: t.estimated_minutes ?? 20,
      searchQuery,
      status: 'todo' as const,
    };
  });
}
