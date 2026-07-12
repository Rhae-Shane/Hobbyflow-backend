import { hobbyTagSchema } from '../src/schemas/hobbyTags.schema';
import { listHobbyCategoriesTool, listHobbiesInCategoryTool } from '../src/services/langgraph/tools/hobbyCatalogTools';

jest.mock('../src/services/hobbyCatalog/hobbyCatalogService', () => ({
  listCategories: jest.fn(async () => [
    { id: 1, name: 'Sports & Fitness', sortOrder: 1 },
    { id: 4, name: 'Music', sortOrder: 4 },
  ]),
  listHobbiesByCategory: jest.fn(async (categoryId: number) => {
    if (categoryId === 4) {
      return {
        categoryId: 4,
        categoryName: 'Music',
        hobbies: [
          { id: 261, name: 'Guitar' },
          { id: 262, name: 'Piano' },
        ],
      };
    }
    return { categoryId, categoryName: '', hobbies: [] };
  }),
}));

describe('hobbyCatalogTools', () => {
  it('list_hobby_categories returns categories JSON', async () => {
    const raw = await listHobbyCategoriesTool.invoke({});
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed.categories).toHaveLength(2);
    expect(parsed.categories[1].name).toBe('Music');
  });

  it('list_hobbies_in_category returns Music hobbies including Guitar', async () => {
    const raw = await listHobbiesInCategoryTool.invoke({ categoryId: 4 });
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed.categoryName).toBe('Music');
    expect(parsed.hobbies.some((h: { name: string }) => h.name === 'Guitar')).toBe(true);
  });

  it('list_hobbies_in_category returns empty for unknown category', async () => {
    const raw = await listHobbiesInCategoryTool.invoke({ categoryId: 999 });
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed.hobbies).toEqual([]);
  });
});

describe('hobbyTagSchema', () => {
  it('accepts catalog + custom tags', () => {
    expect(
      hobbyTagSchema.parse({ hobbyId: 261, name: 'Guitar', source: 'catalog' }),
    ).toMatchObject({ hobbyId: 261, source: 'catalog' });
    expect(
      hobbyTagSchema.parse({ hobbyId: null, name: 'Fingerstyle covers', source: 'custom' }),
    ).toMatchObject({ hobbyId: null, source: 'custom' });
  });

  it('rejects catalog tag without hobbyId', () => {
    expect(() =>
      hobbyTagSchema.parse({ hobbyId: null, name: 'Guitar', source: 'catalog' }),
    ).toThrow();
  });

  it('rejects custom tag with hobbyId', () => {
    expect(() =>
      hobbyTagSchema.parse({ hobbyId: 1, name: 'Custom', source: 'custom' }),
    ).toThrow();
  });
});
