import { supabaseAdmin } from '../../lib/supabase';
import { createChildLogger } from '../../lib/logger';

const log = createChildLogger({ module: 'ask.assertOwn' });

export function notFound(entity: string): string {
  return JSON.stringify({ error: 'not_found', entity });
}

export async function assertRoadmapOwned(
  userId: string,
  roadmapId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId, roadmapId }, 'assertRoadmapOwned query failed');
    return false;
  }
  return Boolean(data);
}

export async function assertPostOwned(userId: string, postId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('id', postId)
    .eq('author_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId, postId }, 'assertPostOwned query failed');
    return false;
  }
  return Boolean(data);
}

export async function assertLessonOwned(
  userId: string,
  lessonId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id')
    .eq('id', lessonId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId, lessonId }, 'assertLessonOwned query failed');
    return false;
  }
  return Boolean(data);
}

export async function assertNodeOwned(userId: string, nodeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId, nodeId }, 'assertNodeOwned query failed');
    return false;
  }
  return Boolean(data);
}
