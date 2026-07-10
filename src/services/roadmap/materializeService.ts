import { createChildLogger } from '../../lib/logger';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { supabaseAdmin } from '../../lib/supabase';
import type {
  MaterializeRoadmapRequest,
  MaterializeRoadmapResponse,
} from '../../schemas/roadmapMaterialize.schema';
import { generateRoadmapPreviewCopy } from './previewCopyService';

const log = createChildLogger({ module: 'roadmap-materialize' });

async function upsertHobby(
  userId: string,
  input: { name: string; level: string; goal: string },
): Promise<{ id: string }> {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('hobbies')
    .select('id')
    .eq('user_id', userId)
    .eq('name', input.name)
    .maybeSingle();

  if (findError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to look up hobby');
  }

  await supabaseAdmin
    .from('hobbies')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .neq('name', input.name);

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('hobbies')
      .update({
        level: input.level,
        goal: input.goal,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error || !data) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to update hobby');
    }
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('hobbies')
    .insert({
      user_id: userId,
      name: input.name,
      level: input.level,
      goal: input.goal,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    log.error({ err: error, userId }, 'Hobby insert failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create hobby');
  }

  return data;
}

async function archiveConversation(userId: string, conversationId: string, hobbyId: string) {
  const { error } = await supabaseAdmin
    .from('chat_conversations')
    .update({
      archived_at: new Date().toISOString(),
      hobby_id: hobbyId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    log.warn({ err: error, conversationId }, 'Failed to archive creation conversation');
  }
}

async function completeOnboardingIfNeeded(userId: string, isFirstRoadmap: boolean) {
  if (!isFirstRoadmap) return;

  const { error } = await supabaseAdmin
    .from('users')
    .update({ completed_onboarding_at: new Date().toISOString() })
    .eq('id', userId)
    .is('completed_onboarding_at', null);

  if (error) {
    log.warn({ err: error, userId }, 'Failed to set completed_onboarding_at');
  }
}

export async function materializeRoadmap(
  userId: string,
  input: MaterializeRoadmapRequest,
): Promise<MaterializeRoadmapResponse> {
  const hobbyName = input.hobby.trim() || input.goalCard.suggestedHobby.trim();
  const hobby = await upsertHobby(userId, {
    name: hobbyName,
    level: input.level,
    goal: input.goalCard.suggestedGoal,
  });

  const preview = await generateRoadmapPreviewCopy({
    title: input.lessonPlan.courseTitle,
    goal: input.goalCard.suggestedGoal,
    background: input.goalCard.suggestedBackground,
    roles: input.userRoles,
  });

  const introPayload = {
    intro: preview.intro,
    achievements: preview.achievements,
    coverPalette: 'original',
  };

  const { data: roadmap, error: roadmapError } = await supabaseAdmin
    .from('roadmaps')
    .insert({
      user_id: userId,
      hobby_id: hobby.id,
      title: input.lessonPlan.courseTitle,
      lesson_plan_id: input.lessonPlan.lessonPlanId,
      outline: input.lessonPlan,
      personalize_metadata: {
        learningGoal: input.goalCard.suggestedGoal,
        backgroundLevel: input.goalCard.suggestedBackground,
        personalizationEnabled: true,
        level: input.level,
      },
      intro: introPayload,
      cover_image_path: null,
      status: 'preview',
    })
    .select('id')
    .single();

  if (roadmapError || !roadmap) {
    log.error({ err: roadmapError, userId }, 'Roadmap insert failed');
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create roadmap');
  }

  const sectionSummaries: Array<{ id: string; name: string; lessonCount: number }> = [];
  let pathOrder = 0;
  let lessonCount = 0;

  for (let sectionIndex = 0; sectionIndex < input.lessonPlan.sections.length; sectionIndex += 1) {
    const section = input.lessonPlan.sections[sectionIndex];

    const { data: sectionNode, error: sectionError } = await supabaseAdmin
      .from('roadmap_nodes')
      .insert({
        roadmap_id: roadmap.id,
        user_id: userId,
        type: 'Section',
        name: section.name,
        content: {},
        metadata: { sectionIndex },
      })
      .select('id')
      .single();

    if (sectionError || !sectionNode) {
      log.error({ err: sectionError, roadmapId: roadmap.id }, 'Section node insert failed');
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create roadmap sections');
    }

    sectionSummaries.push({
      id: sectionNode.id,
      name: section.name,
      lessonCount: section.lessons.length,
    });

    for (let lessonIndex = 0; lessonIndex < section.lessons.length; lessonIndex += 1) {
      const lesson = section.lessons[lessonIndex];

      const { data: lessonNode, error: lessonError } = await supabaseAdmin
        .from('roadmap_nodes')
        .insert({
          roadmap_id: roadmap.id,
          user_id: userId,
          type: 'Lesson',
          name: lesson.name,
          content: { concepts: [], sourceContent: '' },
          metadata: {
            sectionId: sectionNode.id,
            sectionIndex,
            lessonIndex,
            difficulty: input.level,
            hook: lesson.hook,
            meaning: lesson.meaning,
          },
        })
        .select('id')
        .single();

      if (lessonError || !lessonNode) {
        log.error({ err: lessonError, roadmapId: roadmap.id }, 'Lesson node insert failed');
        throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create roadmap lessons');
      }

      const { error: pathError } = await supabaseAdmin.from('roadmap_lessons').insert({
        roadmap_id: roadmap.id,
        node_id: lessonNode.id,
        user_id: userId,
        path_order: pathOrder,
        status: 'pending_content',
        session_config: {
          name: lesson.name,
          hook: lesson.hook,
          meaning: lesson.meaning,
        },
      });

      if (pathError) {
        log.error({ err: pathError, roadmapId: roadmap.id }, 'Lesson path insert failed');
        throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create learning path');
      }

      pathOrder += 1;
      lessonCount += 1;
    }
  }

  if (input.conversationId) {
    await archiveConversation(userId, input.conversationId, hobby.id);
  }

  await completeOnboardingIfNeeded(userId, input.isFirstRoadmap);

  log.info(
    {
      userId,
      roadmapId: roadmap.id,
      hobbyId: hobby.id,
      sectionCount: sectionSummaries.length,
      lessonCount,
    },
    'Roadmap materialized',
  );

  return {
    roadmapId: roadmap.id,
    hobbyId: hobby.id,
    title: input.lessonPlan.courseTitle,
    intro: {
      intro: preview.intro,
      achievements: preview.achievements,
    },
    coverImageUrl: null,
    sections: sectionSummaries,
    lessonCount,
  };
}

export async function getRoadmapDetail(userId: string, roadmapId: string) {
  const { data: roadmap, error } = await supabaseAdmin
    .from('roadmaps')
    .select('*')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap');
  }

  if (!roadmap) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from('roadmap_nodes')
    .select('*')
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (nodesError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap nodes');
  }

  const { data: lessons, error: lessonsError } = await supabaseAdmin
    .from('roadmap_lessons')
    .select('*')
    .eq('roadmap_id', roadmapId)
    .eq('user_id', userId)
    .order('path_order', { ascending: true });

  if (lessonsError) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to load roadmap lessons');
  }

  return {
    roadmap,
    nodes: nodes ?? [],
    lessons: lessons ?? [],
  };
}

export async function activateRoadmap(userId: string, roadmapId: string) {
  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .select('id, hobby_id, status')
    .maybeSingle();

  if (error) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to activate roadmap');
  }

  if (!data) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Roadmap not found');
  }

  return data;
}
