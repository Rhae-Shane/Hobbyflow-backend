import { supabaseAdmin } from '../../lib/supabase';
import { createChildLogger } from '../../lib/logger';

const log = createChildLogger({ module: 'hobby-catalog' });

export type HobbyCategory = {
  id: number;
  name: string;
  sortOrder: number;
};

export type CatalogHobby = {
  id: number;
  name: string;
};

export async function listCategories(): Promise<HobbyCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('hobby_category')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    log.error({ err: error }, 'Failed to list hobby categories');
    throw new Error('Failed to list hobby categories');
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
    sortOrder: row.sort_order as number,
  }));
}

export async function listHobbiesByCategory(categoryId: number): Promise<{
  categoryId: number;
  categoryName: string;
  hobbies: CatalogHobby[];
}> {
  const { data: category, error: catError } = await supabaseAdmin
    .from('hobby_category')
    .select('id, name')
    .eq('id', categoryId)
    .maybeSingle();

  if (catError) {
    log.error({ err: catError, categoryId }, 'Failed to load hobby category');
    throw new Error('Failed to load hobby category');
  }

  if (!category) {
    return { categoryId, categoryName: '', hobbies: [] };
  }

  const { data, error } = await supabaseAdmin
    .from('all_hobbies')
    .select('id, name')
    .eq('category_id', categoryId)
    .order('name', { ascending: true });

  if (error) {
    log.error({ err: error, categoryId }, 'Failed to list hobbies in category');
    throw new Error('Failed to list hobbies in category');
  }

  return {
    categoryId,
    categoryName: category.name as string,
    hobbies: (data ?? []).map((row) => ({
      id: row.id as number,
      name: row.name as string,
    })),
  };
}

export async function hobbyIdsExist(ids: number[]): Promise<Set<number>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Set();

  const { data, error } = await supabaseAdmin.from('all_hobbies').select('id').in('id', unique);

  if (error) {
    log.error({ err: error }, 'Failed to validate catalog hobby ids');
    throw new Error('Failed to validate catalog hobby ids');
  }

  return new Set((data ?? []).map((row) => row.id as number));
}
