import type { HobbyTag } from '../../schemas/hobbyTags.schema';
import { MAX_USER_HOBBY_TAGS } from '../../schemas/hobbyTags.schema';

/**
 * Union-merge profile hobby tags.
 * - Dedup by lower(name); catalog entries win over custom for the same name
 * - Keep existing order, then append new
 * - Cap at MAX_USER_HOBBY_TAGS (drop newest beyond cap)
 */
export function mergeHobbyTags(existing: HobbyTag[], incoming: HobbyTag[]): HobbyTag[] {
  const byName = new Map<string, HobbyTag>();

  const prefer = (a: HobbyTag, b: HobbyTag): HobbyTag => {
    if (a.source === 'catalog' && b.source !== 'catalog') return a;
    if (b.source === 'catalog' && a.source !== 'catalog') return b;
    return a;
  };

  for (const tag of existing) {
    const key = tag.name.trim().toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    byName.set(key, prev ? prefer(prev, tag) : tag);
  }

  const order: string[] = [...byName.keys()];

  for (const tag of incoming) {
    const key = tag.name.trim().toLowerCase();
    if (!key) continue;
    const normalized: HobbyTag = {
      hobbyId: tag.source === 'custom' ? null : tag.hobbyId,
      name: tag.name.trim(),
      source: tag.source,
    };
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, normalized);
      order.push(key);
      continue;
    }
    byName.set(key, prefer(prev, normalized));
  }

  return order
    .map((key) => byName.get(key)!)
    .slice(0, MAX_USER_HOBBY_TAGS);
}
