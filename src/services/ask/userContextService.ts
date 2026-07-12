import { supabaseAdmin } from '../../lib/supabase';
import { createChildLogger } from '../../lib/logger';
import {
  listCategories,
  listHobbiesByCategory,
} from '../hobbyCatalog/hobbyCatalogService';
import {
  assertLessonOwned,
  assertNodeOwned,
  assertPostOwned,
  assertRoadmapOwned,
  notFound,
} from './assertOwn';

const log = createChildLogger({ module: 'ask.userContext' });

function truncate(value: string | null | undefined, max: number): string {
  const text = (value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function daysRemaining(endDate: string, localDate?: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date(`${localDate ?? new Date().toISOString().slice(0, 10)}T00:00:00`);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getMyProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, username, bio, hobby_tags, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId }, 'getMyProfile failed');
    return { error: 'failed' };
  }
  if (!data) return JSON.parse(notFound('profile'));

  return {
    id: data.id,
    username: data.username ?? null,
    bio: truncate(data.bio as string | null, 200),
    hobbyTags: data.hobby_tags ?? [],
    createdAt: data.created_at,
  };
}

export async function getMyPreferences(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .select(
      'top_goals, selected_tags, user_roles, learning_styles, daily_goal, content_language',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId }, 'getMyPreferences failed');
    return { error: 'failed' };
  }
  if (!data) return { preferences: null };

  return {
    topGoals: data.top_goals ?? [],
    selectedTags: data.selected_tags ?? [],
    userRoles: data.user_roles ?? [],
    learningStyles: data.learning_styles ?? [],
    dailyGoal: data.daily_goal ?? '',
    contentLanguage: data.content_language ?? 'en',
  };
}

export async function listMyHobbyTags(userId: string) {
  const profile = await getMyProfile(userId);
  if ('error' in profile) return profile;
  return { hobbyTags: profile.hobbyTags ?? [] };
}

export async function listMyHobbies(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('hobbies')
    .select('id, name, level, goal, is_active, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    log.warn({ err: error, userId }, 'listMyHobbies failed');
    return { error: 'failed' };
  }

  return {
    hobbies: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      goal: truncate(row.goal as string | null, 200),
      isActive: row.is_active,
    })),
  };
}

export async function listMyRoadmaps(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, status, updated_at, hobby_id, hobbies(name)')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    log.warn({ err: error, userId }, 'listMyRoadmaps failed');
    return { error: 'failed' };
  }

  return {
    roadmaps: (data ?? []).map((row) => {
      const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
      const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        hobbyName: hobbyName ?? null,
        updatedAt: row.updated_at,
      };
    }),
  };
}

export async function getRoadmapDetail(userId: string, roadmapId: string) {
  if (!(await assertRoadmapOwned(userId, roadmapId))) {
    return JSON.parse(notFound('roadmap'));
  }

  const { data: roadmap, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, status, hobby_id, hobbies(name)')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !roadmap) {
    return JSON.parse(notFound('roadmap'));
  }

  const { data: lessons } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, path_order, status, node_id, roadmap_nodes(name)')
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId)
    .order('path_order', { ascending: true })
    .limit(40);

  const hobby = roadmap.hobbies as { name?: string } | { name?: string }[] | null;
  const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;

  return {
    id: roadmap.id,
    title: roadmap.title,
    status: roadmap.status,
    hobbyName: hobbyName ?? null,
    lessons: (lessons ?? []).map((lesson) => {
      const node = lesson.roadmap_nodes as { name?: string } | { name?: string }[] | null;
      const title = Array.isArray(node) ? node[0]?.name : node?.name;
      return {
        id: lesson.id,
        title: title ?? 'Lesson',
        status: lesson.status,
        order: lesson.path_order,
      };
    }),
  };
}

export async function getMyRoadmapMindmap(userId: string, roadmapId: string) {
  if (!(await assertRoadmapOwned(userId, roadmapId))) {
    return JSON.parse(notFound('roadmap'));
  }

  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, mindmap')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return JSON.parse(notFound('roadmap'));

  const mindmap = data.mindmap as
    | { nodes?: Array<{ id?: string; label?: string; name?: string }>; edges?: unknown[] }
    | null;

  if (!mindmap) {
    return { id: data.id, title: data.title, mindmap: null };
  }

  const nodes = (mindmap.nodes ?? []).slice(0, 40).map((n) => ({
    id: n.id,
    label: truncate(n.label ?? n.name ?? '', 80),
  }));

  return {
    id: data.id,
    title: data.title,
    nodeCount: mindmap.nodes?.length ?? 0,
    edgeCount: mindmap.edges?.length ?? 0,
    nodes,
  };
}

export async function getMyLesson(
  userId: string,
  opts: { lessonId?: string; nodeId?: string },
) {
  if (opts.lessonId) {
    if (!(await assertLessonOwned(userId, opts.lessonId))) {
      return JSON.parse(notFound('lesson'));
    }
    const { data } = await supabaseAdmin
      .from('roadmap_lessons')
      .select('id, status, path_order, roadmap_id, node_id, roadmap_nodes(name)')
      .eq('id', opts.lessonId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return JSON.parse(notFound('lesson'));
    const node = data.roadmap_nodes as { name?: string } | { name?: string }[] | null;
    const title = Array.isArray(node) ? node[0]?.name : node?.name;
    return {
      id: data.id,
      title: title ?? 'Lesson',
      status: data.status,
      order: data.path_order,
      roadmapId: data.roadmap_id,
      nodeId: data.node_id,
    };
  }

  if (opts.nodeId) {
    if (!(await assertNodeOwned(userId, opts.nodeId))) {
      return JSON.parse(notFound('lesson'));
    }
    const { data } = await supabaseAdmin
      .from('roadmap_nodes')
      .select('id, name, type, roadmap_id')
      .eq('id', opts.nodeId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return JSON.parse(notFound('lesson'));
    return {
      id: data.id,
      title: data.name,
      type: data.type,
      roadmapId: data.roadmap_id,
    };
  }

  return { error: 'lessonId_or_nodeId_required' };
}

export async function getMyLessonContent(userId: string, lessonId: string) {
  if (!(await assertLessonOwned(userId, lessonId))) {
    return JSON.parse(notFound('lesson'));
  }

  const { data: lesson } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, status, node_id, roadmap_id')
    .eq('id', lessonId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!lesson) return JSON.parse(notFound('lesson'));

  const { data: node } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, content')
    .eq('id', lesson.node_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!node) return JSON.parse(notFound('lesson'));

  const content = (node.content ?? {}) as Record<string, unknown>;
  const sourceContent =
    typeof content.sourceContent === 'string' ? content.sourceContent : '';
  const pages = Array.isArray(content.pages) ? content.pages : [];

  return {
    id: lesson.id,
    title: node.name,
    status: lesson.status,
    roadmapId: lesson.roadmap_id,
    summary: truncate(sourceContent, 500),
    pageCount: pages.length,
    pageTitles: pages
      .slice(0, 12)
      .map((p) =>
        truncate(
          typeof p === 'object' && p && 'title' in p
            ? String((p as { title?: string }).title ?? '')
            : '',
          80,
        ),
      )
      .filter(Boolean),
  };
}

export async function getMyGamification(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_gamification')
    .select(
      'rating, current_streak, longest_streak, streak_savers, pacts_fulfilled, league_id, leagues(id, name, min_rating, max_rating)',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error, userId }, 'getMyGamification failed');
    return { error: 'failed' };
  }
  if (!data) {
    return {
      rating: 699,
      currentStreak: 0,
      longestStreak: 0,
      streakSaversRemaining: 3,
      pactsFulfilled: 0,
      league: null,
    };
  }

  const leagueRaw = data.leagues as
    | { id: string; name: string; min_rating: number; max_rating: number }
    | { id: string; name: string; min_rating: number; max_rating: number }[]
    | null;
  const league = Array.isArray(leagueRaw) ? leagueRaw[0] : leagueRaw;

  return {
    rating: data.rating,
    currentStreak: data.current_streak,
    longestStreak: data.longest_streak,
    streakSaversRemaining: data.streak_savers,
    pactsFulfilled: data.pacts_fulfilled,
    league: league
      ? {
          id: league.id,
          name: league.name,
          minRating: league.min_rating,
          maxRating: league.max_rating,
        }
      : null,
  };
}

export async function getLeagueTable() {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('id, name, sort_order, min_rating, max_rating')
    .order('sort_order', { ascending: true });

  if (error) {
    log.warn({ err: error }, 'getLeagueTable failed');
    return { error: 'failed' };
  }

  return {
    leagues: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      minRating: row.min_rating,
      maxRating: row.max_rating,
    })),
  };
}

export async function getMyDailyTask(userId: string, localDate?: string) {
  const taskDate = localDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('daily_tasks')
    .select(
      'id, title, status, rating_reward, task_type, task_date, counts_for_rating, rating_awarded, hobbies(name)',
    )
    .eq('user_id', userId)
    .eq('task_date', taskDate)
    .eq('counts_for_rating', true)
    .in('status', ['open', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    log.warn({ err: error, userId }, 'getMyDailyTask failed');
    return { error: 'failed' };
  }

  const row = data?.[0];
  if (!row) return { taskDate, task: null, note: 'No task generated yet for this date' };

  const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
  const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;

  return {
    taskDate,
    task: {
      id: row.id,
      title: row.title,
      status: row.status,
      ratingReward: row.rating_reward,
      ratingAwarded: row.rating_awarded,
      taskType: row.task_type,
      countsForRating: row.counts_for_rating,
      hobbyName: hobbyName ?? null,
    },
  };
}

export async function listMyDailyTasks(userId: string, limit = 14) {
  const capped = Math.min(Math.max(limit, 1), 14);
  const { data, error } = await supabaseAdmin
    .from('daily_tasks')
    .select(
      'id, title, status, rating_reward, rating_awarded, task_date, counts_for_rating, hobbies(name)',
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('task_date', { ascending: false })
    .limit(capped);

  if (error) {
    log.warn({ err: error, userId }, 'listMyDailyTasks failed');
    return { error: 'failed' };
  }

  return {
    tasks: (data ?? []).map((row) => {
      const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
      const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        ratingReward: row.rating_reward,
        ratingAwarded: row.rating_awarded,
        countsForRating: row.counts_for_rating,
        taskDate: row.task_date,
        hobbyName: hobbyName ?? null,
      };
    }),
  };
}

export async function getMyPact(userId: string, localDate?: string) {
  const [{ data: actives }, gamification] = await Promise.all([
    supabaseAdmin
      .from('user_pacts')
      .select('id, promise_text, start_date, end_date, status, hobbies(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('end_date', { ascending: true }),
    getMyGamification(userId),
  ]);

  const pactsFulfilled =
    'pactsFulfilled' in gamification ? gamification.pactsFulfilled : 0;

  const activeList = (actives ?? []).map((active) => {
    const hobby = active.hobbies as { name?: string } | { name?: string }[] | null;
    const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;
    return {
      id: active.id,
      hobbyName: hobbyName ?? null,
      promise: truncate(active.promise_text, 200),
      startDate: active.start_date,
      endDate: active.end_date,
      daysRemaining: daysRemaining(active.end_date, localDate),
      status: 'active' as const,
    };
  });

  return {
    /** @deprecated Prefer `actives` — first/nearest active pact for older prompts. */
    active: activeList[0] ?? null,
    actives: activeList,
    activeCount: activeList.length,
    pactsFulfilled,
  };
}

export async function listMyPacts(userId: string, limit = 10) {
  const capped = Math.min(Math.max(limit, 1), 10);
  const { data, error } = await supabaseAdmin
    .from('user_pacts')
    .select('id, promise_text, start_date, end_date, status, hobbies(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(capped);

  if (error) {
    log.warn({ err: error, userId }, 'listMyPacts failed');
    return { error: 'failed' };
  }

  return {
    pacts: (data ?? []).map((row) => {
      const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
      const hobbyName = Array.isArray(hobby) ? hobby[0]?.name : hobby?.name;
      return {
        id: row.id,
        hobbyName: hobbyName ?? null,
        promise: truncate(row.promise_text, 200),
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
      };
    }),
  };
}

export async function getMySocialLinks(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profile_social_links')
    .select('platform, url, handle, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    log.warn({ err: error, userId }, 'getMySocialLinks failed');
    return { error: 'failed' };
  }

  return {
    links: (data ?? []).map((row) => ({
      platform: row.platform,
      url: row.url,
      handle: row.handle,
    })),
  };
}

async function mapPostSummary(
  userId: string,
  post: {
    id: string;
    caption: string | null;
    created_at: string;
  },
) {
  const [{ data: media }, { data: tags }] = await Promise.all([
    supabaseAdmin
      .from('post_media')
      .select('kind')
      .eq('post_id', post.id)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('post_hobby_tags')
      .select('name, source')
      .eq('post_id', post.id),
  ]);

  // Ownership already enforced by caller; keep userId referenced for audits.
  void userId;

  return {
    id: post.id,
    caption: truncate(post.caption, 200),
    createdAt: post.created_at,
    mediaKinds: (media ?? []).map((m) => m.kind),
    tags: (tags ?? []).map((t) => ({ name: t.name, source: t.source })),
  };
}

export async function listMyRecentPosts(userId: string, limit = 10) {
  const capped = Math.min(Math.max(limit, 1), 10);
  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('id, caption, created_at')
    .eq('author_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(capped);

  if (error) {
    log.warn({ err: error, userId }, 'listMyRecentPosts failed');
    return { error: 'failed' };
  }

  const posts = await Promise.all(
    (data ?? []).map((post) => mapPostSummary(userId, post)),
  );
  return { posts };
}

export async function getMyPost(userId: string, postId: string) {
  if (!(await assertPostOwned(userId, postId))) {
    return JSON.parse(notFound('post'));
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('id, caption, created_at')
    .eq('id', postId)
    .eq('author_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return JSON.parse(notFound('post'));
  return mapPostSummary(userId, data);
}

export async function searchMyPostsByTag(userId: string, tagName: string) {
  const needle = tagName.trim().toLowerCase();
  if (!needle) return { posts: [] };

  const { data: tagRows, error } = await supabaseAdmin
    .from('post_hobby_tags')
    .select('post_id, name, posts!inner(id, caption, created_at, author_id, deleted_at)')
    .ilike('name', `%${needle}%`)
    .eq('posts.author_id', userId)
    .is('posts.deleted_at', null)
    .limit(20);

  if (error) {
    log.warn({ err: error, userId }, 'searchMyPostsByTag failed');
    return { error: 'failed' };
  }

  const seen = new Set<string>();
  const posts = [];
  for (const row of tagRows ?? []) {
    const post = row.posts as
      | { id: string; caption: string | null; created_at: string }
      | { id: string; caption: string | null; created_at: string }[]
      | null;
    const p = Array.isArray(post) ? post[0] : post;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    posts.push(await mapPostSummary(userId, p));
    if (posts.length >= 10) break;
  }

  return { tagQuery: tagName, posts };
}

export { listCategories as listHobbyCategories, listHobbiesByCategory };
