import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import type { ExerciseAgentBatchOutput, ExerciseAgentSingleOutput } from '../../schemas/exercises.schema';
import {
  invokeExerciseGenerationGraph,
  type ExerciseGenerationContext,
} from '../langgraph/graphs/exerciseGenerationGraph';

const log = createChildLogger({ module: 'exerciseService' });

export const EXERCISE_COMPLETE_RATING = 5;
export const STARTING_RATING = 699;
export const MAX_EXERCISES_PER_LESSON = 6;

const EXERCISE_SELECT =
  'id, user_id, roadmap_id, section_node_id, lesson_id, title, instructions, status, sort_order, generated_by, rating_awarded, created_at, completed_at';

export type RoadmapExerciseRow = {
  id: string;
  user_id: string;
  roadmap_id: string;
  section_node_id: string;
  lesson_id: string;
  title: string;
  instructions: string;
  status: 'incomplete' | 'complete';
  sort_order: number;
  generated_by: 'langgraph';
  rating_awarded: number;
  created_at: string;
  completed_at: string | null;
};

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

function diffDays(a: string, b: string): number {
  const ms =
    new Date(`${a}T12:00:00.000Z`).getTime() - new Date(`${b}T12:00:00.000Z`).getTime();
  return Math.round(ms / 86_400_000);
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

/** Spec 18 activity day: merge date into activity_dates and recompute streak (no rating). */
export async function recordActivityDay(
  userId: string,
  localDate: string,
): Promise<GamificationSnapshot> {
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

  const activityDates = [
    ...new Set([...(gami.activity_dates as string[] | null) ?? [], localDate]),
  ];
  const currentStreak = computeStreakFromDates(activityDates, localDate);
  const longestStreak = Math.max((gami.longest_streak as number) ?? 0, currentStreak);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('user_gamification')
    .update({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      activity_dates: activityDates,
      last_activity_date: localDate,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select(
      'rating, peak_rating, league_id, current_streak, longest_streak, activity_dates, last_activity_date',
    )
    .single();

  if (updateError || !updated) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not record activity day');
  }

  return {
    rating: updated.rating as number,
    peak_rating: updated.peak_rating as number,
    league_id: (updated.league_id as string | null) ?? null,
    current_streak: updated.current_streak as number,
    longest_streak: updated.longest_streak as number,
    activity_dates: (updated.activity_dates as string[]) ?? [],
    last_activity_date: (updated.last_activity_date as string | null) ?? null,
  };
}

async function awardExerciseRatingIfFirstToday(
  userId: string,
  localDate: string,
  snapshot: GamificationSnapshot,
): Promise<{ ratingAwarded: number; gamification: GamificationSnapshot }> {
  const { data: dayRow } = await supabaseAdmin
    .from('exercise_rating_days')
    .select('user_id, activity_date, rating_granted')
    .eq('user_id', userId)
    .eq('activity_date', localDate)
    .maybeSingle();

  if (dayRow?.rating_granted) {
    return { ratingAwarded: 0, gamification: snapshot };
  }

  const rating = clampRating(snapshot.rating + EXERCISE_COMPLETE_RATING);
  const peak = Math.max(snapshot.peak_rating, rating);
  const leagueId = await resolveLeagueId(rating);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('user_gamification')
    .update({
      rating,
      peak_rating: peak,
      league_id: leagueId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select(
      'rating, peak_rating, league_id, current_streak, longest_streak, activity_dates, last_activity_date',
    )
    .single();

  if (updateError || !updated) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not update exercise rating');
  }

  await supabaseAdmin.from('exercise_rating_days').upsert(
    {
      user_id: userId,
      activity_date: localDate,
      rating_granted: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,activity_date' },
  );

  return {
    ratingAwarded: EXERCISE_COMPLETE_RATING,
    gamification: {
      rating: updated.rating as number,
      peak_rating: updated.peak_rating as number,
      league_id: (updated.league_id as string | null) ?? null,
      current_streak: updated.current_streak as number,
      longest_streak: updated.longest_streak as number,
      activity_dates: (updated.activity_dates as string[]) ?? [],
      last_activity_date: (updated.last_activity_date as string | null) ?? null,
    },
  };
}

async function loadPreferencesSummary(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('user_preferences')
    .select(
      'top_goals, user_roles, age_range, accessibility_needs, learning_strengths, practice_environments, resource_budget, learning_styles, content_language',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return {};

  return {
    topGoals: data.top_goals ?? [],
    userRoles: data.user_roles ?? [],
    ageRange: data.age_range ?? '',
    accessibilityNeeds: data.accessibility_needs ?? [],
    learningStrengths: data.learning_strengths ?? [],
    practiceEnvironments: data.practice_environments ?? [],
    resourceBudget: data.resource_budget ?? '',
    learningStyles: data.learning_styles ?? [],
    contentLanguage: data.content_language ?? 'en',
  };
}

type LessonBundle = {
  lesson: {
    id: string;
    roadmap_id: string;
    node_id: string;
    status: string;
    session_config: { name?: string; hook?: string; meaning?: string } | null;
  };
  node: { id: string; name: string; metadata: Record<string, unknown> };
  roadmap: {
    id: string;
    title: string;
    hobby_id: string;
    personalize_metadata: Record<string, unknown> | null;
  };
  hobby: { id: string; name: string };
  section: { id: string; name: string };
  siblingLessonNames: string[];
};

async function loadLessonBundle(
  userId: string,
  roadmapId: string,
  lessonId: string,
): Promise<LessonBundle> {
  const { data: roadmap, error: roadmapError } = await supabaseAdmin
    .from('roadmaps')
    .select('id, title, hobby_id, personalize_metadata')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (roadmapError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap');
  }
  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const { data: lesson, error: lessonError } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, roadmap_id, node_id, status, session_config')
    .eq('id', lessonId)
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (lessonError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load lesson');
  }
  if (!lesson) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson not found');
  }

  if (lesson.status === 'skipped') {
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Cannot generate exercises for a skipped lesson');
  }

  const { data: node, error: nodeError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('id', lesson.node_id)
    .eq('roadmap_id', roadmapId)
    .maybeSingle();

  if (nodeError || !node) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Lesson node not found');
  }

  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  const sectionId = typeof metadata.sectionId === 'string' ? metadata.sectionId : '';
  if (!sectionId) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Lesson is missing section metadata');
  }

  const { data: section, error: sectionError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name')
    .eq('id', sectionId)
    .eq('roadmap_id', roadmapId)
    .eq('type', 'Section')
    .maybeSingle();

  if (sectionError || !section) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Section not found');
  }

  const { data: hobby } = await supabaseAdmin
    .from('hobbies')
    .select('id, name')
    .eq('id', roadmap.hobby_id)
    .maybeSingle();

  if (!hobby) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Hobby not found');
  }

  const { data: siblingNodes } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('id, name, metadata')
    .eq('roadmap_id', roadmapId)
    .eq('type', 'Lesson');

  const siblingLessonNames = (siblingNodes ?? [])
    .filter((n) => {
      const meta = (n.metadata ?? {}) as Record<string, unknown>;
      return meta.sectionId === sectionId && n.id !== node.id;
    })
    .map((n) => n.name as string)
    .filter(Boolean)
    .slice(0, 8);

  return {
    lesson: {
      id: lesson.id as string,
      roadmap_id: lesson.roadmap_id as string,
      node_id: lesson.node_id as string,
      status: lesson.status as string,
      session_config: (lesson.session_config ?? null) as LessonBundle['lesson']['session_config'],
    },
    node: {
      id: node.id as string,
      name: node.name as string,
      metadata,
    },
    roadmap: {
      id: roadmap.id as string,
      title: roadmap.title as string,
      hobby_id: roadmap.hobby_id as string,
      personalize_metadata: (roadmap.personalize_metadata ?? null) as Record<string, unknown> | null,
    },
    hobby: { id: hobby.id as string, name: hobby.name as string },
    section: { id: section.id as string, name: section.name as string },
    siblingLessonNames,
  };
}

async function listExistingForLesson(
  userId: string,
  lessonId: string,
): Promise<RoadmapExerciseRow[]> {
  const { data, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .select(EXERCISE_SELECT)
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load exercises');
  }

  return (data ?? []) as RoadmapExerciseRow[];
}

async function buildContext(
  userId: string,
  bundle: LessonBundle,
  mode: 'batch' | 'single_regenerate',
  avoidTitles: string[],
): Promise<ExerciseGenerationContext> {
  const existing = await listExistingForLesson(userId, bundle.lesson.id);
  const preferences = await loadPreferencesSummary(userId);
  const personalize = (bundle.roadmap.personalize_metadata ?? {}) as Record<string, unknown>;
  const session = bundle.lesson.session_config ?? {};

  return {
    mode,
    hobby: bundle.hobby,
    section: bundle.section,
    lesson: {
      id: bundle.lesson.id,
      name: session.name || bundle.node.name,
      hook: session.hook || (typeof bundle.node.metadata.hook === 'string' ? bundle.node.metadata.hook : ''),
      meaning:
        session.meaning ||
        (typeof bundle.node.metadata.meaning === 'string' ? bundle.node.metadata.meaning : ''),
    },
    siblingLessonNames: bundle.siblingLessonNames,
    preferences,
    personalize: {
      learningGoal: personalize.learningGoal,
      backgroundLevel: personalize.backgroundLevel,
      learnerContextSummary: personalize.learnerContextSummary,
      level: personalize.level,
    },
    existingTitles: existing.map((e) => e.title).slice(0, 10),
    avoidTitles: avoidTitles.slice(0, 10),
  };
}

export async function listExercises(
  userId: string,
  roadmapId: string,
  filters: { lessonId?: string; sectionId?: string } = {},
): Promise<{ exercises: RoadmapExerciseRow[] }> {
  const { data: roadmap } = await supabaseAdmin
    .from('roadmaps')
    .select('id')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  let query = supabaseAdmin
    .from('roadmap_exercises')
    .select(EXERCISE_SELECT)
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .order('created_at', { ascending: true });

  if (filters.lessonId) {
    query = query.eq('lesson_id', filters.lessonId);
  }
  if (filters.sectionId) {
    query = query.eq('section_node_id', filters.sectionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not list exercises');
  }

  return { exercises: (data ?? []) as RoadmapExerciseRow[] };
}

export async function countExercisesByLessonNodeIds(
  userId: string,
  roadmapId: string,
  lessonNodeIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (lessonNodeIds.length === 0) return counts;

  const { data: lessons } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('id, node_id')
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .in('node_id', lessonNodeIds);

  const lessonIds = (lessons ?? []).map((l) => l.id as string);
  if (lessonIds.length === 0) return counts;

  const { data: exercises } = await supabaseAdmin
    .from('roadmap_exercises')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .in('lesson_id', lessonIds);

  const lessonIdToNode = new Map(
    (lessons ?? []).map((l) => [l.id as string, l.node_id as string]),
  );

  for (const row of exercises ?? []) {
    const nodeId = lessonIdToNode.get(row.lesson_id as string);
    if (!nodeId) continue;
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }

  return counts;
}

export async function countExercisesForRoadmap(
  userId: string,
  roadmapId: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId);

  if (error) {
    log.warn({ err: error, roadmapId }, 'count exercises failed');
    return 0;
  }

  return count ?? 0;
}

export async function generateExercisesForLesson(
  userId: string,
  roadmapId: string,
  lessonId: string,
): Promise<{ exercises: RoadmapExerciseRow[] }> {
  const bundle = await loadLessonBundle(userId, roadmapId, lessonId);
  const existing = await listExistingForLesson(userId, lessonId);

  if (existing.length >= MAX_EXERCISES_PER_LESSON) {
    throw new AppError(
      409,
      ErrorCodes.VALIDATION_ERROR,
      `This lesson already has ${MAX_EXERCISES_PER_LESSON} exercises. Regenerate individual ones instead.`,
    );
  }

  const remainingSlots = MAX_EXERCISES_PER_LESSON - existing.length;
  const context = await buildContext(userId, bundle, 'batch', existing.map((e) => e.title));

  let agent: ExerciseAgentBatchOutput;
  try {
    const result = await invokeExerciseGenerationGraph({ userId, context });
    if (result.mode !== 'batch') {
      throw new Error('Expected batch output');
    }
    agent = result.output;
  } catch (error) {
    log.error({ err: error, userId, lessonId }, 'exercise generation failed');
    throw new AppError(502, ErrorCodes.INTERNAL_ERROR, 'Exercise generation failed');
  }

  const toInsert = agent.exercises.slice(0, Math.min(3, remainingSlots));
  if (toInsert.length < 2 && remainingSlots >= 2) {
    throw new AppError(502, ErrorCodes.INTERNAL_ERROR, 'Exercise generation returned too few items');
  }
  if (toInsert.length === 0) {
    throw new AppError(
      409,
      ErrorCodes.VALIDATION_ERROR,
      'No room left for more exercises on this lesson',
    );
  }

  const baseOrder = existing.length;
  const rows = toInsert.map((item, index) => ({
    user_id: userId,
    roadmap_id: roadmapId,
    section_node_id: bundle.section.id,
    lesson_id: lessonId,
    title: item.title.trim().slice(0, 80),
    instructions: item.instructions.trim().slice(0, 800),
    status: 'incomplete' as const,
    sort_order: baseOrder + index,
    generated_by: 'langgraph' as const,
    rating_awarded: 0,
  }));

  const { data, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .insert(rows)
    .select(EXERCISE_SELECT);

  if (error || !data) {
    log.error({ err: error, userId, lessonId }, 'insert exercises failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not save exercises');
  }

  return { exercises: data as RoadmapExerciseRow[] };
}

export async function regenerateExercise(
  userId: string,
  roadmapId: string,
  exerciseId: string,
): Promise<{ exercise: RoadmapExerciseRow }> {
  const { data: existing, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .select(EXERCISE_SELECT)
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load exercise');
  }
  if (!existing) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Exercise not found');
  }

  const row = existing as RoadmapExerciseRow;
  const bundle = await loadLessonBundle(userId, roadmapId, row.lesson_id);
  const siblings = await listExistingForLesson(userId, row.lesson_id);
  const avoidTitles = siblings.filter((e) => e.id !== row.id).map((e) => e.title);
  avoidTitles.push(row.title);

  const context = await buildContext(userId, bundle, 'single_regenerate', avoidTitles);

  let agent: ExerciseAgentSingleOutput;
  try {
    const result = await invokeExerciseGenerationGraph({ userId, context });
    if (result.mode !== 'single_regenerate') {
      throw new Error('Expected single output');
    }
    agent = result.output;
  } catch (err) {
    log.error({ err, userId, exerciseId }, 'exercise regenerate failed');
    throw new AppError(502, ErrorCodes.INTERNAL_ERROR, 'Exercise regeneration failed');
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('roadmap_exercises')
    .update({
      title: agent.title.trim().slice(0, 80),
      instructions: agent.instructions.trim().slice(0, 800),
      status: 'incomplete',
      completed_at: null,
      rating_awarded: 0,
    })
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .select(EXERCISE_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not update exercise');
  }

  return { exercise: updated as RoadmapExerciseRow };
}

export async function completeExercise(
  userId: string,
  roadmapId: string,
  exerciseId: string,
  localDate: string,
): Promise<{
  exercise: RoadmapExerciseRow;
  ratingAwarded: number;
  gamification: GamificationSnapshot;
}> {
  const { data: existing, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .select(EXERCISE_SELECT)
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load exercise');
  }
  if (!existing) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Exercise not found');
  }

  const row = existing as RoadmapExerciseRow;
  if (row.status === 'complete') {
    const snapshot = await recordActivityDay(userId, localDate);
    return { exercise: row, ratingAwarded: 0, gamification: snapshot };
  }

  let gamification = await recordActivityDay(userId, localDate);
  const award = await awardExerciseRatingIfFirstToday(userId, localDate, gamification);
  gamification = award.gamification;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('roadmap_exercises')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      rating_awarded: award.ratingAwarded,
    })
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .eq('status', 'incomplete')
    .select(EXERCISE_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    // Race: another request completed it
    const { data: again } = await supabaseAdmin
      .from('roadmap_exercises')
      .select(EXERCISE_SELECT)
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .maybeSingle();
    if (again && (again as RoadmapExerciseRow).status === 'complete') {
      return {
        exercise: again as RoadmapExerciseRow,
        ratingAwarded: 0,
        gamification,
      };
    }
    throw new AppError(409, ErrorCodes.VALIDATION_ERROR, 'Could not complete exercise');
  }

  return {
    exercise: updated as RoadmapExerciseRow,
    ratingAwarded: award.ratingAwarded,
    gamification,
  };
}

export async function incompleteExercise(
  userId: string,
  roadmapId: string,
  exerciseId: string,
): Promise<{ exercise: RoadmapExerciseRow }> {
  const { data: existing, error } = await supabaseAdmin
    .from('roadmap_exercises')
    .select(EXERCISE_SELECT)
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .eq('roadmap_id', roadmapId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not load exercise');
  }
  if (!existing) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Exercise not found');
  }

  const row = existing as RoadmapExerciseRow;
  if (row.status === 'incomplete') {
    return { exercise: row };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('roadmap_exercises')
    .update({
      status: 'incomplete',
      completed_at: null,
      // Keep rating_awarded audit on the row history? Spec: clear on regenerate only.
      // Uncomplete: do not claw back; leave rating_awarded as historical note.
    })
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .select(EXERCISE_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not update exercise');
  }

  return { exercise: updated as RoadmapExerciseRow };
}
