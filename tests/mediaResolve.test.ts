import {
  ensureHobbyInQuery,
  isSearchResultsUrl,
  resolveYouTubeVideo,
  searchYouTubeCandidates,
} from '../src/services/lesson/mediaResolve';

jest.mock('../src/services/langgraph/llm', () => ({
  invokeChatModel: jest.fn(),
}));

import { invokeChatModel } from '../src/services/langgraph/llm';

const mockInvoke = invokeChatModel as jest.MockedFunction<typeof invokeChatModel>;

describe('mediaResolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects search result URLs', () => {
    expect(isSearchResultsUrl('https://www.youtube.com/results?search_query=drums')).toBe(true);
    expect(isSearchResultsUrl('https://www.google.com/search?q=drums')).toBe(true);
    expect(isSearchResultsUrl('https://www.youtube.com/watch?v=oI_EnzY4jvY')).toBe(false);
  });

  it('prefixes hobby when the query omitted it', () => {
    expect(ensureHobbyInQuery('Guitar', 'fingerpicking beginner')).toBe(
      'Guitar fingerpicking beginner',
    );
    expect(ensureHobbyInQuery('Guitar', 'Guitar barre chords')).toBe('Guitar barre chords');
  });

  it('returns null instead of unrelated curated CS/Python videos when search fails', async () => {
    mockInvoke.mockResolvedValue({
      content:
        '{"decision":"reject","reason":"no results","nextQuery":"Drums keeping time beginner tutorial"}',
    } as never);

    const video = await resolveYouTubeVideo('drumming keeping time beginner tutorial', 'video', {
      hobby: 'Drums',
      lessonName: 'Keeping Time',
    });
    const audio = await resolveYouTubeVideo('drumming metronome play along podcast', 'audio', {
      hobby: 'Drums',
      lessonName: 'Keeping Time',
    });

    expect(video).toBeNull();
    expect(audio).toBeNull();
  });

  it('returns candidate snippets from Tavily and lets the agent select one', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('tavily.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                url: 'https://www.youtube.com/watch?v=oI_EnzY4jvY',
                title: 'Drums Keeping Time Beginner',
                content: 'Beginner drumming pulse lesson',
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response;
    });

    mockInvoke.mockResolvedValue({
      content: '{"decision":"select","videoId":"oI_EnzY4jvY"}',
    } as never);

    if (!process.env.TAVILY_API_KEY && !process.env.YOUTUBE_API_KEY) {
      const candidates = await searchYouTubeCandidates('Drums keeping time');
      expect(candidates).toEqual([]);
      return;
    }

    const video = await resolveYouTubeVideo('keeping time beginner', 'video', {
      hobby: 'Drums',
      lessonName: 'Keeping Time',
    });

    expect(video).not.toBeNull();
    expect(video!.source.externalId).toBe('oI_EnzY4jvY');
    expect(video!.source.searchQuery).toContain('Drums');
    expect(video!.url).toBe('https://www.youtube.com/watch?v=oI_EnzY4jvY');
    expect(isSearchResultsUrl(video!.url)).toBe(false);
  });
});
