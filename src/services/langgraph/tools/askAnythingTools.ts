import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as ctx from '../../ask/userContextService';

export type AskAnythingToolsContext = {
  userId: string;
  localDate?: string;
};

function toJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Factory binds JWT userId via closure. Tool schemas must never accept userId/authorId.
 */
export function createAskAnythingTools(options: AskAnythingToolsContext) {
  const { userId, localDate } = options;

  const getMyProfile = new DynamicStructuredTool({
    name: 'get_my_profile',
    description: 'Get the signed-in user profile (username, bio, hobby tags). No email.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getMyProfile(userId)),
  });

  const getMyPreferences = new DynamicStructuredTool({
    name: 'get_my_preferences',
    description: 'Get onboarding preferences for the signed-in user.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getMyPreferences(userId)),
  });

  const listMyHobbyTags = new DynamicStructuredTool({
    name: 'list_my_hobby_tags',
    description: 'List hobby tags on the signed-in user profile.',
    schema: z.object({}),
    func: async () => toJson(await ctx.listMyHobbyTags(userId)),
  });

  const listMyHobbies = new DynamicStructuredTool({
    name: 'list_my_hobbies',
    description: 'List hobbies owned by the signed-in user.',
    schema: z.object({}),
    func: async () => toJson(await ctx.listMyHobbies(userId)),
  });

  const listMyRoadmaps = new DynamicStructuredTool({
    name: 'list_my_roadmaps',
    description: 'List roadmaps owned by the signed-in user.',
    schema: z.object({}),
    func: async () => toJson(await ctx.listMyRoadmaps(userId)),
  });

  /** Alias — models sometimes invent get_my_roadmaps instead of list_my_roadmaps */
  const getMyRoadmaps = new DynamicStructuredTool({
    name: 'get_my_roadmaps',
    description: 'Alias for list_my_roadmaps. List roadmaps owned by the signed-in user.',
    schema: z.object({}),
    func: async () => toJson(await ctx.listMyRoadmaps(userId)),
  });

  const getRoadmapDetail = new DynamicStructuredTool({
    name: 'get_roadmap_detail',
    description:
      'Get one owned roadmap with lesson titles/status. Returns not_found if missing or not owned.',
    schema: z.object({
      roadmapId: z.string().uuid().describe('Roadmap id owned by the signed-in user'),
    }),
    func: async ({ roadmapId }) => toJson(await ctx.getRoadmapDetail(userId, roadmapId)),
  });

  const getMyRoadmapMindmap = new DynamicStructuredTool({
    name: 'get_my_roadmap_mindmap',
    description: 'Get mind map summary for an owned roadmap.',
    schema: z.object({
      roadmapId: z.string().uuid(),
    }),
    func: async ({ roadmapId }) => toJson(await ctx.getMyRoadmapMindmap(userId, roadmapId)),
  });

  const getMyLesson = new DynamicStructuredTool({
    name: 'get_my_lesson',
    description: 'Get one owned lesson by lessonId or nodeId.',
    schema: z.object({
      lessonId: z.string().uuid().optional(),
      nodeId: z.string().uuid().optional(),
    }),
    func: async ({ lessonId, nodeId }) =>
      toJson(await ctx.getMyLesson(userId, { lessonId, nodeId })),
  });

  const getMyLessonContent = new DynamicStructuredTool({
    name: 'get_my_lesson_content',
    description: 'Get generated content summary for an owned lesson.',
    schema: z.object({
      lessonId: z.string().uuid(),
    }),
    func: async ({ lessonId }) => toJson(await ctx.getMyLessonContent(userId, lessonId)),
  });

  const getMyGamification = new DynamicStructuredTool({
    name: 'get_my_gamification',
    description: 'Get streak, rating, streak savers, pacts fulfilled, and league for the user.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getMyGamification(userId)),
  });

  const getLeagueTable = new DynamicStructuredTool({
    name: 'get_league_table',
    description: 'List public league rating bands.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getLeagueTable()),
  });

  const getMyDailyTask = new DynamicStructuredTool({
    name: 'get_my_daily_task',
    description: "Get today's daily task for the signed-in user.",
    schema: z.object({}),
    func: async () => toJson(await ctx.getMyDailyTask(userId, localDate)),
  });

  const listMyDailyTasks = new DynamicStructuredTool({
    name: 'list_my_daily_tasks',
    description: 'List recent daily tasks (max 14).',
    schema: z.object({
      limit: z.number().int().min(1).max(14).optional(),
    }),
    func: async ({ limit }) => toJson(await ctx.listMyDailyTasks(userId, limit)),
  });

  const getMyPact = new DynamicStructuredTool({
    name: 'get_my_pact',
    description:
      'Get all active pacts (user may have more than one), nearest deadline first, plus pacts fulfilled count.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getMyPact(userId, localDate)),
  });

  const listMyPacts = new DynamicStructuredTool({
    name: 'list_my_pacts',
    description: 'List recent pacts of any status (max 10).',
    schema: z.object({
      limit: z.number().int().min(1).max(10).optional(),
    }),
    func: async ({ limit }) => toJson(await ctx.listMyPacts(userId, limit)),
  });

  const getMySocialLinks = new DynamicStructuredTool({
    name: 'get_my_social_links',
    description: 'Get social links on the signed-in user profile.',
    schema: z.object({}),
    func: async () => toJson(await ctx.getMySocialLinks(userId)),
  });

  const listMyRecentPosts = new DynamicStructuredTool({
    name: 'list_my_recent_posts',
    description: 'List recent posts authored by the signed-in user.',
    schema: z.object({
      limit: z.number().int().min(1).max(10).optional(),
    }),
    func: async ({ limit }) => toJson(await ctx.listMyRecentPosts(userId, limit)),
  });

  const getMyPost = new DynamicStructuredTool({
    name: 'get_my_post',
    description: 'Get one post authored by the signed-in user. not_found otherwise.',
    schema: z.object({
      postId: z.string().uuid(),
    }),
    func: async ({ postId }) => toJson(await ctx.getMyPost(userId, postId)),
  });

  const searchMyPostsByTag = new DynamicStructuredTool({
    name: 'search_my_posts_by_tag',
    description: 'Search the signed-in user’s posts by hobby tag name.',
    schema: z.object({
      tagName: z.string().min(1).max(80),
    }),
    func: async ({ tagName }) => toJson(await ctx.searchMyPostsByTag(userId, tagName)),
  });

  const listHobbyCategories = new DynamicStructuredTool({
    name: 'list_hobby_categories',
    description: 'List public hobby catalog categories.',
    schema: z.object({}),
    func: async () => {
      const categories = await ctx.listHobbyCategories();
      return toJson({ categories });
    },
  });

  const listHobbiesInCategory = new DynamicStructuredTool({
    name: 'list_hobbies_in_category',
    description: 'List public catalog hobbies in a category.',
    schema: z.object({
      categoryId: z.number().int().min(1),
    }),
    func: async ({ categoryId }) => toJson(await ctx.listHobbiesByCategory(categoryId)),
  });

  return [
    getMyProfile,
    getMyPreferences,
    listMyHobbyTags,
    listMyHobbies,
    listMyRoadmaps,
    getMyRoadmaps,
    getRoadmapDetail,
    getMyRoadmapMindmap,
    getMyLesson,
    getMyLessonContent,
    getMyGamification,
    getLeagueTable,
    getMyDailyTask,
    listMyDailyTasks,
    getMyPact,
    listMyPacts,
    getMySocialLinks,
    listMyRecentPosts,
    getMyPost,
    searchMyPostsByTag,
    listHobbyCategories,
    listHobbiesInCategory,
  ];
}
