import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';

const log = createChildLogger({ module: 'leaderboardService' });

type HobbyTagRow = {
  hobbyId: number | null;
  name: string;
};

function parseHobbyTags(raw: unknown): HobbyTagRow[] {
  if (!Array.isArray(raw)) return [];
  const out: HobbyTagRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const hobbyId =
      typeof row.hobbyId === 'number' && Number.isInteger(row.hobbyId) ? row.hobbyId : null;
    out.push({ hobbyId, name });
  }
  return out;
}

export type LeaderboardUserIdsFilter =
  | { kind: 'category'; categoryId: number }
  | { kind: 'tag'; hobbyId: number | null; tagName?: string };

export async function resolveLeaderboardUserIds(
  filter: LeaderboardUserIdsFilter,
): Promise<string[]> {
  let allowedHobbyIds: Set<number> | null = null;

  if (filter.kind === 'category') {
    const { data, error } = await supabaseAdmin
      .from('all_hobbies')
      .select('id')
      .eq('category_id', filter.categoryId);

    if (error) {
      log.error({ err: error }, 'Failed to load category hobbies');
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to resolve leaderboard filter');
    }

    allowedHobbyIds = new Set((data ?? []).map((r) => r.id as number));
    if (allowedHobbyIds.size === 0) return [];
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, hobby_tags');

  if (usersError) {
    log.error({ err: usersError }, 'Failed to load users for leaderboard filter');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to resolve leaderboard filter');
  }

  const ids: string[] = [];
  const needle = filter.kind === 'tag' ? (filter.tagName ?? '').trim().toLowerCase() : '';

  for (const user of users ?? []) {
    const tags = parseHobbyTags(user.hobby_tags);
    if (filter.kind === 'category' && allowedHobbyIds) {
      if (tags.some((t) => t.hobbyId != null && allowedHobbyIds!.has(t.hobbyId))) {
        ids.push(user.id as string);
      }
      continue;
    }

    if (filter.kind === 'tag') {
      if (filter.hobbyId != null) {
        if (tags.some((t) => t.hobbyId === filter.hobbyId)) ids.push(user.id as string);
      } else if (needle) {
        if (tags.some((t) => t.name.trim().toLowerCase() === needle)) ids.push(user.id as string);
      }
    }
  }

  return ids;
}
