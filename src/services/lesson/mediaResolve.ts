import { createHash, randomUUID } from 'crypto';
import { env } from '../../config/env';
import { createChildLogger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import type { LessonMediaAsset } from '../../schemas/lessonContent.schema';
import { runVideoSearchAgent } from './videoSearchAgent';

export {
  buildYouTubeMediaAsset,
  ensureHobbyInQuery,
  searchYouTubeCandidates,
  youtubeThumb,
  youtubeWatchUrl,
  type YouTubeCandidate,
} from './youtubeCandidates';

const log = createChildLogger({ module: 'mediaResolve' });

/**
 * Resolve a YouTube watch URL via search → judge → refine retry agent.
 * Returns null when no on-topic video is found — never invents filler clips.
 */
export async function resolveYouTubeVideo(
  query: string,
  kind: 'video' | 'audio',
  options?: { hobby?: string; lessonName?: string },
): Promise<LessonMediaAsset | null> {
  return runVideoSearchAgent({
    initialQuery: query,
    kind,
    hobby: options?.hobby ?? '',
    lessonName: options?.lessonName ?? '',
  });
}

type GoogleImageHit = { link: string; title?: string };

async function searchGoogleImages(query: string): Promise<GoogleImageHit | null> {
  if (!env.GOOGLE_API_KEY || !env.GOOGLE_CSE_ID) return null;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.GOOGLE_API_KEY);
  url.searchParams.set('cx', env.GOOGLE_CSE_ID);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '3');
  url.searchParams.set('safe', 'active');

  const response = await fetch(url);
  if (!response.ok) {
    log.warn({ status: response.status, query }, 'Google image search failed');
    return null;
  }

  const data = (await response.json()) as {
    items?: Array<{ link?: string; title?: string }>;
  };
  const hit = data.items?.find((item) => item.link);
  if (!hit?.link) return null;
  return { link: hit.link, title: hit.title };
}

function buildSvgIllustration(label: string): Buffer {
  const safe = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 48);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B4D3E"/>
      <stop offset="100%" stop-color="#3D7A66"/>
    </linearGradient>
  </defs>
  <rect width="800" height="480" fill="url(#g)"/>
  <circle cx="640" cy="120" r="80" fill="#F4E8C8" opacity="0.25"/>
  <circle cx="160" cy="360" r="100" fill="#F4E8C8" opacity="0.18"/>
  <text x="40" y="250" fill="#F8F4EC" font-family="Georgia, serif" font-size="36">${safe}</text>
</svg>`;
  return Buffer.from(svg, 'utf8');
}

/** Stable JPEG URL RN Image can always render (used when Storage upload fails). */
function placeholderJpegUrl(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `https://picsum.photos/seed/${hash}/800/480`;
}

export async function persistImageBuffer(options: {
  userId: string;
  roadmapId: string;
  nodeId: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
}): Promise<{ url: string; storagePath: string } | null> {
  const hash = createHash('sha256').update(options.buffer).digest('hex').slice(0, 24);
  const storagePath = `${options.userId}/${options.roadmapId}/${options.nodeId}/${hash}.${options.extension}`;

  const { error } = await supabaseAdmin.storage
    .from('lesson-media')
    .upload(storagePath, options.buffer, {
      contentType: options.contentType,
      upsert: true,
    });

  if (error) {
    log.warn({ err: error.message, storagePath }, 'Failed to upload lesson image');
    return null;
  }

  const { data } = supabaseAdmin.storage.from('lesson-media').getPublicUrl(storagePath);
  return { url: data.publicUrl, storagePath };
}

export async function resolveLessonImage(options: {
  query: string;
  alt: string;
  userId: string;
  roadmapId: string;
  nodeId: string;
}): Promise<LessonMediaAsset> {
  const fetchedAt = new Date().toISOString();
  const googleHit = await searchGoogleImages(options.query);

  if (googleHit) {
    try {
      const imageResponse = await fetch(googleHit.link, {
        signal: AbortSignal.timeout(8_000),
      });
      if (imageResponse.ok) {
        const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
        // Prefer raster formats RN Image can display; skip SVG from Google.
        if (!contentType.includes('svg')) {
          const extension = contentType.includes('png')
            ? 'png'
            : contentType.includes('webp')
              ? 'webp'
              : 'jpg';
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          const uploaded = await persistImageBuffer({
            userId: options.userId,
            roadmapId: options.roadmapId,
            nodeId: options.nodeId,
            buffer,
            contentType: contentType.split(';')[0] ?? 'image/jpeg',
            extension,
          });
          if (uploaded) {
            return {
              id: randomUUID(),
              kind: 'image',
              url: uploaded.url,
              storagePath: uploaded.storagePath,
              title: googleHit.title ?? options.alt,
              alt: options.alt,
              source: {
                provider: 'google_images',
                searchQuery: options.query,
                sourceUrl: uploaded.url,
                fetchedAt,
              },
            };
          }
          // Storage failed — still use the remote Google image URL if it's https
          if (googleHit.link.startsWith('https://') && !isSearchResultsUrl(googleHit.link)) {
            return {
              id: randomUUID(),
              kind: 'image',
              url: googleHit.link,
              title: googleHit.title ?? options.alt,
              alt: options.alt,
              source: {
                provider: 'google_images',
                searchQuery: options.query,
                sourceUrl: googleHit.link,
                fetchedAt,
              },
            };
          }
        }
      }
    } catch (error) {
      log.warn({ err: error }, 'Google image download failed');
    }
  }

  const svg = buildSvgIllustration(options.alt || options.query);
  const uploaded = await persistImageBuffer({
    userId: options.userId,
    roadmapId: options.roadmapId,
    nodeId: options.nodeId,
    buffer: svg,
    contentType: 'image/svg+xml',
    extension: 'svg',
  });

  if (uploaded) {
    return {
      id: randomUUID(),
      kind: 'image',
      url: uploaded.url,
      storagePath: uploaded.storagePath,
      title: options.alt,
      alt: options.alt,
      source: {
        provider: 'llm_svg',
        searchQuery: options.query,
        sourceUrl: uploaded.url,
        fetchedAt,
      },
    };
  }

  // Last resort: JPEG placeholder (RN Image cannot render SVG data URLs)
  const jpegUrl = placeholderJpegUrl(`${options.roadmapId}:${options.nodeId}:${options.query}`);
  return {
    id: randomUUID(),
    kind: 'image',
    url: jpegUrl,
    title: options.alt,
    alt: options.alt,
    source: {
      provider: 'curated',
      searchQuery: options.query,
      sourceUrl: jpegUrl,
      fetchedAt,
    },
  };
}

/** True if URL looks like a search results page (must never reach the client as content). */
export function isSearchResultsUrl(url: string): boolean {
  return /youtube\.com\/results\?|google\.[^/]+\/search|images\.google\.|bing\.com\/images/i.test(
    url,
  );
}
