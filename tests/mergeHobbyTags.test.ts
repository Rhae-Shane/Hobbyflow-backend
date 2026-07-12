import { mergeHobbyTags } from '../src/services/hobbyCatalog/mergeHobbyTags';
import type { HobbyTag } from '../src/schemas/hobbyTags.schema';
import { MAX_USER_HOBBY_TAGS } from '../src/schemas/hobbyTags.schema';

describe('mergeHobbyTags', () => {
  const guitar: HobbyTag = { hobbyId: 261, name: 'Guitar', source: 'catalog' };
  const yoga: HobbyTag = { hobbyId: 10, name: 'Yoga', source: 'catalog' };

  it('unions distinct tags', () => {
    expect(mergeHobbyTags([guitar], [yoga])).toEqual([guitar, yoga]);
  });

  it('prefers catalog over custom for the same name', () => {
    const customGuitar: HobbyTag = { hobbyId: null, name: 'guitar', source: 'custom' };
    expect(mergeHobbyTags([guitar], [customGuitar])).toEqual([guitar]);
    expect(mergeHobbyTags([customGuitar], [guitar])).toEqual([guitar]);
  });

  it('caps at MAX_USER_HOBBY_TAGS and keeps existing order', () => {
    const existing: HobbyTag[] = Array.from({ length: MAX_USER_HOBBY_TAGS }, (_, i) => ({
      hobbyId: i + 1,
      name: `Hobby ${i + 1}`,
      source: 'catalog' as const,
    }));
    const extra: HobbyTag = { hobbyId: 999, name: 'Extra', source: 'catalog' };
    const merged = mergeHobbyTags(existing, [extra]);
    expect(merged).toHaveLength(MAX_USER_HOBBY_TAGS);
    expect(merged[0]?.name).toBe('Hobby 1');
    expect(merged.some((t) => t.name === 'Extra')).toBe(false);
  });
});
