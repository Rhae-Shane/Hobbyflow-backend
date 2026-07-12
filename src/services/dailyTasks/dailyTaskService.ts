import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import type { DailyTaskAgentOutput } from '../../schemas/dailyTasks.schema';
import {
  invokeDailyTaskGenerationGraph,
  type DailyTaskContext,
} from '../langgraph/graphs/dailyTaskGenerationGraph';

const log = createChildLogger({ module: 'dailyTaskService' });

export const DAILY_TASK_RATING_REWARD = 10;
export const MAX_STREAK_BONUS = 7;
export const STARTING_RATING = 699;
export const MAX_BONUS_TASKS_PER_DAY = 5;
export const MAX_REGENERATES = 2;

const TASK_SELECT =
  'id, user_id, hobby_id, task_date, task_type, title, rating_reward, status, completed_at, counts_for_rating, regenerates_used, structured, rating_awarded, generated_by, created_at, updated_at';

export type DailyTaskRow = {
  id: string;
  user_id: string;
  hobby_id: string | null;
  task_date: string;
  task_type: 'complete_lesson' | 'practice_minutes' | 'custom';
  title: string;
  rating_reward: number;
  status: 'open' | 'completed' | 'expired' | 'discarded';
  completed_at: string | null;
  counts_for_rating: boolean;
  regenerates_used: number;
  structured: Record<string, unknown>;
  rating_awarded: number;
  generated_by: 'langgraph' | 'legacy';
  created_at: string;
  updated_at: string;
};

export type HistoryItem =
  | { kind: 'completed'; task_date: string; tasks: Array<DailyTaskRow & { hobby_name?: string | null }> }
  | { kind: 'missed_day'; task_date: string };

export type GamificationSnapshot = {
  rating: number;
  peak_rating: number;
  league_id: string | null;
  current_streak: number;
  longest_streak: number;
  activity_dates: string[];
  last_activity_date: string | null;
};

function clampRating(rating: number): number {
  return Math.max(STARTING_RATING, rating);
}

function streakBonusFor(currentStreak: number): number {
  return Math.min(Math.max(currentStreak, 0), MAX_STREAK_BONUS);
}

function computeStreakFromDates(activityDates: string[], today: string): number {
  if (activityDates.length === 0) return 0;
  const unique = [...new Set(activityDates)].sort((a, b) => b.localeCompare(a));
  const yesterday = shiftDate(today, -1);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = unique[i - 1]!;
    const cur = unique[i]!;
    if (diffDays(prev, cur) === 1) streak++;
    else break;
  }
  return streak;
}

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(later: string, earlier: string): number {
  const a = new Date(`${later}T12:00:00.000Z`).getTime();
  const b = new Date(`${earlier}T12:00:00.000Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return out;
}

async function expirePastOpenTasks(userId: string, today: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('daily_tasks')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'open')
    .lt('task_date', today);

  if (error) {
    log.warn({ err: error, userId }, 'expirePastOpenTasks failed');
  }
}

async function ensureDayRow(userId: string, taskDate: string) {
  const existing = await getDayRow(userId, taskDate);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('daily_task_days')
    .insert({ user_id: userId, task_date: taskDate })
    .select('user_id, task_date, regenerates_used, rating_granted')
    .maybeSingle();

  if (error || !data) {
    const again = await getDayRow(userId, taskDate);
    if (again) return again;
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load daily task day state');
  }

  return data;
}

async function getDayRow(userId: string, taskDate: string) {
  const { data, error } = await supabaseAdmin
    .from('daily_task_days')
    .select('user_id, task_date, regenerates_used, rating_granted')
    .eq('user_id', userId)
    .eq('task_date', taskDate)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load daily task day state');
  }
  return data;
}

async function loadHobbies(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabaseAdmin
    .from('hobbies')
    .select('id, name')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load hobbies');
  }
  return (data ?? []).map((h) => ({ id: h.id as string, name: h.name as string }));
}

async function loadGenerationContext(
  userId: string,
  taskDate: string,
  mode: 'primary' | 'regenerate' | 'bonus',
): Promise<DailyTaskContext> {
  const hobbies = await loadHobbies(userId);
  if (hobbies.length === 0) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Add a hobby before generating a daily task');
  }

  const [{ data: recent }, { data: discarded }, { data: gamification }, { data: roadmaps }] =
    await Promise.all([
      supabaseAdmin
        .from('daily_tasks')
        .select('title, task_date, hobbies(name)')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('task_date', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('daily_tasks')
        .select('title')
        .eq('user_id', userId)
        .eq('task_date', taskDate)
        .eq('status', 'discarded')
        .limit(5),
      supabaseAdmin
        .from('user_gamification')
        .select('rating, current_streak')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('roadmaps')
        .select('id, title, hobby_id, hobbies(name)')
        .eq('user_id', userId)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })
        .limit(3),
    ]);

  const roadmapProgress: DailyTaskContext['progress']['roadmaps'] = [];
  for (const roadmap of roadmaps ?? []) {
    const { data: lessons } = await supabaseAdmin
      .from('roadmap_lessons')
      .select('status, roadmap_nodes(name)')
      .eq('roadmap_id', roadmap.id)
      .eq('user_id', userId)
      .in('status', ['pending_content', 'ready', 'planned'])
      .order('path_order', { ascending: true })
      .limit(5);

    const pendingLessons = (lessons ?? [])
      .filter((l) => l.status !== 'completed')
      .map((l) => {
        const node = l.roadmap_nodes as { name?: string } | { name?: string }[] | null;
        return Array.isArray(node) ? node[0]?.name : node?.name;
      })
      .filter((n): n is string => Boolean(n))
      .slice(0, 3);

    const hobby = roadmap.hobbies as { name?: string } | { name?: string }[] | null;
    roadmapProgress.push({
      title: roadmap.title as string,
      hobbyName: Array.isArray(hobby) ? hobby[0]?.name ?? null : hobby?.name ?? null,
      pendingLessons,
    });
  }

  return {
    mode,
    taskDate,
    hobbies,
    recentCompleted: (recent ?? []).map((row) => {
      const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
      return {
        title: row.title as string,
        taskDate: row.task_date as string,
        hobbyName: Array.isArray(hobby) ? hobby[0]?.name ?? null : hobby?.name ?? null,
      };
    }),
    discardedTitles: (discarded ?? []).map((d) => d.title as string),
    progress: {
      currentStreak: (gamification?.current_streak as number | undefined) ?? 0,
      rating: (gamification?.rating as number | undefined) ?? STARTING_RATING,
      roadmaps: roadmapProgress,
    },
  };
}

function structuredFromOutput(output: DailyTaskAgentOutput): Record<string, unknown> {
  if (output.task_type === 'practice_minutes') {
    return { minutes: output.minutes ?? 15 };
  }
  return {};
}

async function insertTask(input: {
  userId: string;
  taskDate: string;
  output: DailyTaskAgentOutput;
  countsForRating: boolean;
  regeneratesUsed: number;
}): Promise<DailyTaskRow> {
  const { data, error } = await supabaseAdmin
    .from('daily_tasks')
    .insert({
      user_id: input.userId,
      hobby_id: input.output.hobby_id,
      task_date: input.taskDate,
      task_type: input.output.task_type,
      title: input.output.title.trim(),
      rating_reward: DAILY_TASK_RATING_REWARD,
      status: 'open',
      counts_for_rating: input.countsForRating,
      regenerates_used: input.regeneratesUsed,
      structured: structuredFromOutput(input.output),
      rating_awarded: 0,
      generated_by: 'langgraph',
    })
    .select(TASK_SELECT)
    .single();

  if (error || !data) {
    log.error({ err: error, userId: input.userId }, 'insert daily task failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not save daily task');
  }

  return data as DailyTaskRow;
}

async function resolveLeagueId(rating: number): Promise<string> {
  const { data } = await supabaseAdmin
    .from('leagues')
    .select('id, min_rating, max_rating')
    .order('sort_order', { ascending: true });

  const match = (data ?? []).find(
    (l) => rating >= (l.min_rating as number) && rating <= (l.max_rating as number),
  );
  return (match?.id as string | undefined) ?? 'wood';
}

export async function getTodayDailyTasks(userId: string, taskDate: string) {
  await expirePastOpenTasks(userId, taskDate);

  const { data, error } = await supabaseAdmin
    .from('daily_tasks')
    .select(TASK_SELECT)
    .eq('user_id', userId)
    .eq('task_date', taskDate)
    .in('status', ['open', 'completed'])
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load today\'s tasks');
  }

  const tasks = (data ?? []) as DailyTaskRow[];
  const day = await getDayRow(userId, taskDate);
  const primary =
    tasks.find((t) => t.counts_for_rating && t.status === 'open') ??
    tasks.find((t) => t.counts_for_rating && t.status === 'completed') ??
    null;
  const bonus = tasks.filter((t) => !t.counts_for_rating);

  return {
    task_date: taskDate,
    primary,
    bonus,
    regenerates_used: day?.regenerates_used ?? primary?.regenerates_used ?? 0,
    regenerates_remaining: Math.max(
      0,
      MAX_REGENERATES - (day?.regenerates_used ?? primary?.regenerates_used ?? 0),
    ),
    rating_granted: day?.rating_granted ?? false,
    can_generate_primary: !tasks.some((t) => t.counts_for_rating),
    can_generate_bonus:
      tasks.some((t) => t.counts_for_rating && t.status === 'completed') &&
      bonus.length < MAX_BONUS_TASKS_PER_DAY,
  };
}

export async function generateDailyTask(
  userId: string,
  taskDate: string,
  mode: 'primary' | 'regenerate' | 'bonus',
): Promise<{ task: DailyTaskRow; today: Awaited<ReturnType<typeof getTodayDailyTasks>> }> {
  await expirePastOpenTasks(userId, taskDate);
  await ensureDayRow(userId, taskDate);
  const day = await getDayRow(userId, taskDate);
  if (!day) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load daily task day state');
  }

  const { data: existing } = await supabaseAdmin
    .from('daily_tasks')
    .select(TASK_SELECT)
    .eq('user_id', userId)
    .eq('task_date', taskDate)
    .in('status', ['open', 'completed']);

  const rows = (existing ?? []) as DailyTaskRow[];
  const openPrimary = rows.find((t) => t.counts_for_rating && t.status === 'open');
  const completedPrimary = rows.find((t) => t.counts_for_rating && t.status === 'completed');
  const bonusCount = rows.filter((t) => !t.counts_for_rating).length;

  if (mode === 'primary') {
    if (openPrimary || completedPrimary) {
      throw new AppError(
        409,
        ErrorCodes.VALIDATION_ERROR,
        'Today\'s rating task already exists. Use regenerate or generate another.',
      );
    }
  } else if (mode === 'regenerate') {
    if (!openPrimary) {
      throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'No open primary task to regenerate');
    }
    if (day.regenerates_used >= MAX_REGENERATES) {
      throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Regenerate limit reached (2 max)');
    }
  } else if (mode === 'bonus') {
    if (!completedPrimary) {
      throw new AppError(
        409,
        ErrorCodes.VALIDATION_ERROR,
        'Complete today\'s rated task before generating another',
      );
    }
    if (bonusCount >= MAX_BONUS_TASKS_PER_DAY) {
      throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Bonus task limit reached for today');
    }
  }

  let output: DailyTaskAgentOutput;
  try {
    const context = await loadGenerationContext(userId, taskDate, mode);
    output = await invokeDailyTaskGenerationGraph({ userId, context });
  } catch (error) {
    log.error({ err: error, userId, mode, taskDate }, 'LangGraph daily task failed');
    throw new AppError(
      502,
      ErrorCodes.CHAT_UNAVAILABLE,
      'Could not generate today\'s task. Please try again.',
    );
  }

  let regeneratesUsed = day.regenerates_used;

  if (mode === 'regenerate' && openPrimary) {
    const { error: discardError } = await supabaseAdmin
      .from('daily_tasks')
      .update({ status: 'discarded', updated_at: new Date().toISOString() })
      .eq('id', openPrimary.id)
      .eq('user_id', userId);

    if (discardError) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not discard previous task');
    }

    regeneratesUsed = day.regenerates_used + 1;
    const { error: dayError } = await supabaseAdmin
      .from('daily_task_days')
      .update({ regenerates_used: regeneratesUsed, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('task_date', taskDate);

    if (dayError) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not update regenerate count');
    }
  }

  const task = await insertTask({
    userId,
    taskDate,
    output,
    countsForRating: mode !== 'bonus',
    regeneratesUsed: mode === 'bonus' ? 0 : regeneratesUsed,
  });

  const today = await getTodayDailyTasks(userId, taskDate);
  return { task, today };
}

export async function completeDailyTask(
  userId: string,
  taskId: string,
  localDate: string,
): Promise<{
  task: DailyTaskRow;
  ratingAwarded: number;
  gamification: GamificationSnapshot | null;
  today: Awaited<ReturnType<typeof getTodayDailyTasks>>;
}> {
  await expirePastOpenTasks(userId, localDate);

  const { data: task, error } = await supabaseAdmin
    .from('daily_tasks')
    .select(TASK_SELECT)
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !task) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Daily task not found');
  }

  const row = task as DailyTaskRow;
  if (row.status !== 'open') {
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Task is not open');
  }

  let ratingAwarded = 0;
  let gamification: GamificationSnapshot | null = null;

  if (row.counts_for_rating) {
    await ensureDayRow(userId, row.task_date);
    const day = await getDayRow(userId, row.task_date);
    if (day?.rating_granted) {
      // Should not happen for open primary, but guard double-award.
      ratingAwarded = 0;
    } else {
      const { data: gami, error: gamiError } = await supabaseAdmin
        .from('user_gamification')
        .select(
          'rating, peak_rating, league_id, current_streak, longest_streak, activity_dates, last_activity_date',
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (gamiError || !gami) {
        throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load gamification');
      }

      const activityDates = [...new Set([...(gami.activity_dates as string[] | null) ?? [], row.task_date])];
      const currentStreak = computeStreakFromDates(activityDates, row.task_date);
      const longestStreak = Math.max((gami.longest_streak as number) ?? 0, currentStreak);
      const bonus = streakBonusFor(currentStreak);
      ratingAwarded = DAILY_TASK_RATING_REWARD + bonus;
      const rating = clampRating(((gami.rating as number) ?? STARTING_RATING) + ratingAwarded);
      const peak = Math.max((gami.peak_rating as number) ?? STARTING_RATING, rating);
      const leagueId = await resolveLeagueId(rating);

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('user_gamification')
        .update({
          rating,
          peak_rating: peak,
          league_id: leagueId,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          activity_dates: activityDates,
          last_activity_date: row.task_date,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select(
          'rating, peak_rating, league_id, current_streak, longest_streak, activity_dates, last_activity_date',
        )
        .single();

      if (updateError || !updated) {
        throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not update rating');
      }

      await supabaseAdmin
        .from('daily_task_days')
        .update({ rating_granted: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('task_date', row.task_date);

      gamification = {
        rating: updated.rating as number,
        peak_rating: updated.peak_rating as number,
        league_id: (updated.league_id as string | null) ?? null,
        current_streak: updated.current_streak as number,
        longest_streak: updated.longest_streak as number,
        activity_dates: (updated.activity_dates as string[]) ?? [],
        last_activity_date: (updated.last_activity_date as string | null) ?? null,
      };
    }
  }

  const { data: completed, error: completeError } = await supabaseAdmin
    .from('daily_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      rating_awarded: ratingAwarded,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .select(TASK_SELECT)
    .maybeSingle();

  if (completeError || !completed) {
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Could not complete task');
  }

  const today = await getTodayDailyTasks(userId, row.task_date);
  return {
    task: completed as DailyTaskRow,
    ratingAwarded,
    gamification,
    today,
  };
}

export async function getDailyTaskHistory(
  userId: string,
  options: { limit?: number; before?: string; today: string },
): Promise<{ items: HistoryItem[]; member_since: string }> {
  const today = options.today;
  await expirePastOpenTasks(userId, today);

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load user for history');
  }

  const memberSince = userRow?.created_at
    ? String(userRow.created_at).slice(0, 10)
    : today;

  const lookbackDays = Math.min(Math.max(options.limit ?? 30, 7), 90);
  const lookbackStart = shiftDate(today, -(lookbackDays - 1));
  // Never show days before the account was created.
  const start = memberSince > lookbackStart ? memberSince : lookbackStart;
  if (start > today) {
    return { items: [], member_since: memberSince };
  }

  const { data, error } = await supabaseAdmin
    .from('daily_tasks')
    .select(`${TASK_SELECT}, hobbies(name)`)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('task_date', start)
    .lte('task_date', today)
    .order('task_date', { ascending: false })
    .order('completed_at', { ascending: false });

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load task history');
  }

  const completedByDate = new Map<
    string,
    Array<DailyTaskRow & { hobby_name?: string | null }>
  >();
  for (const row of data ?? []) {
    const hobby = row.hobbies as { name?: string } | { name?: string }[] | null;
    const hobbyName = Array.isArray(hobby) ? hobby[0]?.name ?? null : hobby?.name ?? null;
    const taskDate = row.task_date as string;
    const mapped = {
      ...(row as unknown as DailyTaskRow),
      hobby_name: hobbyName,
    };
    const list = completedByDate.get(taskDate) ?? [];
    list.push(mapped);
    completedByDate.set(taskDate, list);
  }

  // Primary (rating) tasks first, then bonus, then by completed_at desc within group.
  for (const [date, list] of completedByDate) {
    list.sort((a, b) => {
      const ratingDiff = Number(b.counts_for_rating) - Number(a.counts_for_rating);
      if (ratingDiff !== 0) return ratingDiff;
      return String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? ''));
    });
    completedByDate.set(date, list);
  }

  const items: HistoryItem[] = [];
  const endPastOrToday = today;
  const dates = eachDateInclusive(start, endPastOrToday).reverse();
  for (const date of dates) {
    if (date < memberSince) continue;
    const completed = completedByDate.get(date);
    if (completed && completed.length > 0) {
      items.push({ kind: 'completed', task_date: date, tasks: completed });
    } else if (date < today) {
      items.push({ kind: 'missed_day', task_date: date });
    }
  }

  return { items, member_since: memberSince };
}
