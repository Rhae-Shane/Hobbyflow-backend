import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { createChildLogger } from '../../lib/logger';
import type { LessonMediaAsset } from '../../schemas/lessonContent.schema';

const log = createChildLogger({ module: 'youtubeCandidates' });

export type YouTubeCandidate = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
};

/** Prefix hobby when the model omitted it — keeps YouTube/Tavily hits on-topic. */
export function ensureHobbyInQuery(hobby: string, query: string): string {
  const q = query.trim().replace(/\s+/g, ' ');
  const h = hobby.trim();
  if (!q) return h;
  if (!h) return q;
  if (q.toLowerCase().includes(h.toLowerCase())) return q;
  return `${h} ${q}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function extractYouTubeId(text: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

function dedupeCandidates(candidates: YouTubeCandidate[]): YouTubeCandidate[] {
  const seen = new Set<string>();
  const out: YouTubeCandidate[] = [];
  for (const c of candidates) {
    if (!c.videoId || seen.has(c.videoId)) continue;
    seen.add(c.videoId);
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

async function searchYouTubeApiCandidates(query: string): Promise<YouTubeCandidate[]> {
  if (!env.YOUTUBE_API_KEY) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('q', query);
  url.searchParams.set('key', env.YOUTUBE_API_KEY);
  url.searchParams.set('safeSearch', 'strict');

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      log.warn({ status: response.status, query }, 'YouTube search API failed');
      return [];
    }

    const data = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
        };
      }>;
    };

    return dedupeCandidates(
      (data.items ?? [])
        .map((item) => {
          const videoId = item.id?.videoId;
          if (!videoId) return null;
          return {
            videoId,
            title: item.snippet?.title?.trim() || 'YouTube video',
            description: (item.snippet?.description ?? '').slice(0, 280),
            channelTitle: item.snippet?.channelTitle?.trim() || 'Unknown',
          };
        })
        .filter((c): c is YouTubeCandidate => Boolean(c)),
    );
  } catch (error) {
    log.warn({ err: error, query }, 'YouTube search API error');
    return [];
  }
}

async function searchTavilyYouTubeCandidates(query: string): Promise<YouTubeCandidate[]> {
  if (!env.TAVILY_API_KEY) return [];

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query: `${query} site:youtube.com`,
        search_depth: 'basic',
        max_results: 5,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string }>;
    };

    const candidates: YouTubeCandidate[] = [];
    for (const result of data.results ?? []) {
      const fromUrl = result.url ? extractYouTubeId(result.url) : null;
      const fromContent = result.content ? extractYouTubeId(result.content) : null;
      const videoId = fromUrl ?? fromContent;
      if (!videoId) continue;
      candidates.push({
        videoId,
        title: result.title?.trim() || 'YouTube video',
        description: (result.content ?? '').slice(0, 280),
        channelTitle: 'YouTube',
      });
    }
    return dedupeCandidates(candidates);
  } catch (error) {
    log.warn({ err: error }, 'Tavily YouTube search failed');
    return [];
  }
}

/** Search YouTube (API first, then Tavily) and return up to 5 candidates with snippets. */
export async function searchYouTubeCandidates(query: string): Promise<YouTubeCandidate[]> {
  const fromApi = await searchYouTubeApiCandidates(query);
  if (fromApi.length > 0) return fromApi;
  return searchTavilyYouTubeCandidates(query);
}

export function buildYouTubeMediaAsset(input: {
  kind: 'video' | 'audio';
  videoId: string;
  title: string;
  searchQuery: string;
}): LessonMediaAsset {
  const fetchedAt = new Date().toISOString();
  return {
    id: randomUUID(),
    kind: input.kind,
    url: youtubeWatchUrl(input.videoId),
    title: input.title || (input.kind === 'audio' ? 'Listen along' : 'Watch this lesson'),
    source: {
      provider: 'youtube',
      searchQuery: input.searchQuery,
      externalId: input.videoId,
      sourceUrl: youtubeWatchUrl(input.videoId),
      fetchedAt,
    },
    thumbnailUrl: youtubeThumb(input.videoId),
  };
}
