import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import type { HobbyTag } from '../../schemas/hobbyTags.schema';
import { hobbyIdsExist } from './hobbyCatalogService';
import { mergeHobbyTags } from './mergeHobbyTags';

const log = createChildLogger({ module: 'user-hobby-tags' });

function parseStoredTags(raw: unknown): HobbyTag[] {
  if (!Array.isArray(raw)) return [];
  const out: HobbyTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const source = row.source === 'catalog' || row.source === 'custom' ? row.source : null;
    if (!name || !source) continue;
    const hobbyId =
      typeof row.hobbyId === 'number' && Number.isInteger(row.hobbyId) ? row.hobbyId : null;
    if (source === 'catalog' && hobbyId == null) continue;
    if (source === 'custom' && hobbyId != null) continue;
    out.push({ hobbyId: source === 'custom' ? null : hobbyId, name, source });
  }
  return out;
}

/**
 * Validate incoming tags against catalog, merge into users.hobby_tags, save.
 */
export async function mergeAndSaveUserHobbyTags(
  userId: string,
  incoming: HobbyTag[],
): Promise<HobbyTag[]> {
  if (incoming.length === 0) return [];

  const catalogIds = incoming
    .filter((t) => t.source === 'catalog' && t.hobbyId != null)
    .map((t) => t.hobbyId!);
  const validIds = await hobbyIdsExist(catalogIds);

  const sanitized: HobbyTag[] = [];
  for (const tag of incoming) {
    if (tag.source === 'custom') {
      sanitized.push({ hobbyId: null, name: tag.name.trim(), source: 'custom' });
      continue;
    }
    if (tag.hobbyId != null && validIds.has(tag.hobbyId)) {
      sanitized.push({
        hobbyId: tag.hobbyId,
        name: tag.name.trim(),
        source: 'catalog',
      });
    }
  }

  if (sanitized.length === 0) return [];

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('hobby_tags')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    log.error({ err: fetchError, userId }, 'Failed to load hobby_tags');
    throw new Error('Failed to load hobby tags');
  }

  const existing = parseStoredTags(row?.hobby_tags);
  const merged = mergeHobbyTags(existing, sanitized);

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      hobby_tags: merged,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    log.error({ err: updateError, userId }, 'Failed to save hobby_tags');
    throw new Error('Failed to save hobby tags');
  }

  log.info({ userId, added: sanitized.length, total: merged.length }, 'Merged user hobby tags');
  return merged;
}
