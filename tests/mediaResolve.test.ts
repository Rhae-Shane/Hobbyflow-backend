import { isSearchResultsUrl, resolveYouTubeVideo } from '../src/services/lesson/mediaResolve';

describe('mediaResolve', () => {
  beforeEach(() => {
    // Avoid hanging on real network during unit tests
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

  it('resolves YouTube to a concrete videoId, never a search URL', async () => {
    const video = await resolveYouTubeVideo('drumming keeping time beginner tutorial', 'video');
    const audio = await resolveYouTubeVideo('drumming metronome play along podcast', 'audio');

    expect(video.kind).toBe('video');
    expect(audio.kind).toBe('audio');
    expect(video.source.externalId).toMatch(/^[a-zA-Z0-9_-]{11}$/);
    expect(audio.source.externalId).toMatch(/^[a-zA-Z0-9_-]{11}$/);
    expect(video.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    expect(audio.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    expect(isSearchResultsUrl(video.url)).toBe(false);
    expect(isSearchResultsUrl(audio.url)).toBe(false);
  });

  it('is deterministic for the same query', async () => {
    const a = await resolveYouTubeVideo('same query forever', 'video');
    const b = await resolveYouTubeVideo('same query forever', 'video');
    expect(a.source.externalId).toBe(b.source.externalId);
  });
});
