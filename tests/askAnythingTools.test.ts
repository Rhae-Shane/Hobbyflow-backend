import { notFound } from '../src/services/ask/assertOwn';
import { createAskAnythingTools } from '../src/services/langgraph/tools/askAnythingTools';

const mockAssertRoadmapOwned = jest.fn();
const mockAssertPostOwned = jest.fn();

jest.mock('../src/services/ask/assertOwn', () => {
  const actual = jest.requireActual('../src/services/ask/assertOwn');
  return {
    ...actual,
    assertRoadmapOwned: (...args: unknown[]) => mockAssertRoadmapOwned(...args),
    assertPostOwned: (...args: unknown[]) => mockAssertPostOwned(...args),
    assertLessonOwned: jest.fn(async () => false),
    assertNodeOwned: jest.fn(async () => false),
  };
});

jest.mock('../src/services/ask/userContextService', () => ({
  getMyProfile: jest.fn(async () => ({
    id: 'user-a',
    username: 'alice',
    bio: 'hi',
    hobbyTags: [{ hobbyId: 1, name: 'Guitar', source: 'catalog' }],
    createdAt: '2026-01-01T00:00:00Z',
  })),
  getMyPreferences: jest.fn(async () => ({ dailyGoal: '30 min' })),
  listMyHobbyTags: jest.fn(async () => ({ hobbyTags: [] })),
  listMyHobbies: jest.fn(async () => ({ hobbies: [{ id: 'h1', name: 'Guitar' }] })),
  listMyRoadmaps: jest.fn(async () => ({ roadmaps: [] })),
  getRoadmapDetail: jest.fn(async (userId: string, roadmapId: string) => {
    const owned = await mockAssertRoadmapOwned(userId, roadmapId);
    if (!owned) return { error: 'not_found', entity: 'roadmap' };
    return { id: roadmapId, title: 'Secret Roadmap', lessons: [] };
  }),
  getMyRoadmapMindmap: jest.fn(async () => ({ error: 'not_found', entity: 'roadmap' })),
  getMyLesson: jest.fn(async () => ({ error: 'not_found', entity: 'lesson' })),
  getMyLessonContent: jest.fn(async () => ({ error: 'not_found', entity: 'lesson' })),
  getMyGamification: jest.fn(async () => ({
    rating: 720,
    currentStreak: 3,
    longestStreak: 10,
    streakSaversRemaining: 2,
    pactsFulfilled: 1,
    league: { id: 'l1', name: 'Bronze', minRating: 699, maxRating: 799 },
  })),
  getLeagueTable: jest.fn(async () => ({ leagues: [] })),
  getMyDailyTask: jest.fn(async () => ({ task: null })),
  listMyDailyTasks: jest.fn(async () => ({ tasks: [] })),
  getMyPact: jest.fn(async () => ({
    active: null,
    actives: [],
    activeCount: 0,
    pactsFulfilled: 0,
  })),
  listMyPacts: jest.fn(async () => ({ pacts: [] })),
  getMySocialLinks: jest.fn(async () => ({ links: [] })),
  listMyRecentPosts: jest.fn(async () => ({ posts: [] })),
  getMyPost: jest.fn(async (userId: string, postId: string) => {
    const owned = await mockAssertPostOwned(userId, postId);
    if (!owned) return { error: 'not_found', entity: 'post' };
    return { id: postId, caption: 'mine' };
  }),
  searchMyPostsByTag: jest.fn(async () => ({ posts: [] })),
  listHobbyCategories: jest.fn(async () => [{ id: 1, name: 'Music', sortOrder: 1 }]),
  listHobbiesByCategory: jest.fn(async () => ({
    categoryId: 1,
    categoryName: 'Music',
    hobbies: [],
  })),
}));

describe('askAnythingTools security', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const foreignRoadmap = '22222222-2222-4222-8222-222222222222';
  const foreignPost = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes expected tool names without identity args', () => {
    const tools = createAskAnythingTools({ userId: userA });
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_my_profile');
    expect(names).toContain('get_my_gamification');
    expect(names).toContain('get_my_pact');
    expect(names).toContain('get_roadmap_detail');
    expect(names.length).toBeGreaterThanOrEqual(18);
  });

  it('get_my_profile never returns email', async () => {
    const tools = createAskAnythingTools({ userId: userA });
    const profileTool = tools.find((t) => t.name === 'get_my_profile')!;
    const raw = await profileTool.invoke({});
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed.email).toBeUndefined();
    expect(parsed.username).toBe('alice');
  });

  it('get_roadmap_detail returns not_found for foreign roadmap', async () => {
    mockAssertRoadmapOwned.mockResolvedValue(false);
    const tools = createAskAnythingTools({ userId: userA });
    const tool = tools.find((t) => t.name === 'get_roadmap_detail')!;
    const raw = await tool.invoke({ roadmapId: foreignRoadmap });
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed).toEqual({ error: 'not_found', entity: 'roadmap' });
    expect(parsed.title).toBeUndefined();
  });

  it('get_my_post returns not_found for foreign post', async () => {
    mockAssertPostOwned.mockResolvedValue(false);
    const tools = createAskAnythingTools({ userId: userA });
    const tool = tools.find((t) => t.name === 'get_my_post')!;
    const raw = await tool.invoke({ postId: foreignPost });
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed).toEqual({ error: 'not_found', entity: 'post' });
  });

  it('get_my_gamification returns real numbers for owner', async () => {
    const tools = createAskAnythingTools({ userId: userA });
    const tool = tools.find((t) => t.name === 'get_my_gamification')!;
    const raw = await tool.invoke({});
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    expect(parsed.rating).toBe(720);
    expect(parsed.currentStreak).toBe(3);
  });
});

describe('notFound helper', () => {
  it('returns stable JSON shape', () => {
    expect(JSON.parse(notFound('roadmap'))).toEqual({
      error: 'not_found',
      entity: 'roadmap',
    });
  });
});
