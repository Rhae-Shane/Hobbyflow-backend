import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  listCategories,
  listHobbiesByCategory,
} from '../../hobbyCatalog/hobbyCatalogService';

export const listHobbyCategoriesTool = new DynamicStructuredTool({
  name: 'list_hobby_categories',
  description:
    'List all HobbyFlow hobby categories (id, name, sortOrder). Call once when matching the user to catalog tags before goal_suggestion.',
  schema: z.object({}),
  func: async () => {
    const categories = await listCategories();
    return JSON.stringify({ categories });
  },
});

export const listHobbiesInCategoryTool = new DynamicStructuredTool({
  name: 'list_hobbies_in_category',
  description:
    'List catalog hobbies for a category_id returned by list_hobby_categories. Call after picking 1–2 fitting categories.',
  schema: z.object({
    categoryId: z.number().int().positive().describe('hobby_category.id'),
  }),
  func: async ({ categoryId }) => {
    const result = await listHobbiesByCategory(categoryId);
    return JSON.stringify(result);
  },
});

export const hobbyCatalogTools = [listHobbyCategoriesTool, listHobbiesInCategoryTool];
