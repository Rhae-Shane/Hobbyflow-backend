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
  options?: { hobby?: string; lessonName?: string; excludeExternalIds?: string[] },
): Promise<LessonMediaAsset | null> {
  const asset = await runVideoSearchAgent({
    initialQuery: query,
    kind,
    hobby: options?.hobby ?? '',
    lessonName: options?.lessonName ?? '',
  });
  if (!asset) return null;
  if (options?.excludeExternalIds?.includes(asset.source.externalId ?? '')) {
    return null;
  }
  return asset;
}

type ImageHit = { link: string; title?: string };

async function searchGoogleImages(
  query: string,
  options?: { excludeUrls?: Set<string> },
): Promise<ImageHit | null> {
  if (!env.GOOGLE_API_KEY || !env.GOOGLE_CSE_ID) return null;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.GOOGLE_API_KEY);
  url.searchParams.set('cx', env.GOOGLE_CSE_ID);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '8');
  url.searchParams.set('safe', 'active');

  const response = await fetch(url);
  if (!response.ok) {
    log.warn({ status: response.status, query }, 'Google image search failed');
    return null;
  }

  const data = (await response.json()) as {
    items?: Array<{ link?: string; title?: string }>;
  };
  const exclude = options?.excludeUrls;
  const hit = data.items?.find(
    (item) => item.link && (!exclude || !exclude.has(item.link)),
  );
  if (!hit?.link) return null;
  return { link: hit.link, title: hit.title };
}

/** Wikimedia Commons file search — free educational diagrams/photos. */
async function searchWikimediaImages(
  query: string,
  options?: { excludeUrls?: Set<string> },
): Promise<ImageHit | null> {
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6'); // File:
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', '8');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size');
    url.searchParams.set('iiurlwidth', '1200');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'HobbyFlow/1.0 (lesson-media; educational)' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      log.warn({ status: response.status, query }, 'Wikimedia image search failed');
      return null;
    }

    const data = (await response.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{
              url?: string;
              thumburl?: string;
              mime?: string;
            }>;
          }
        >;
      };
    };

    const pages = Object.values(data.query?.pages ?? {});
    const exclude = options?.excludeUrls;
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const mime = info?.mime ?? '';
      if (!mime.startsWith('image/') || mime.includes('svg')) continue;
      const link = info?.thumburl || info?.url;
      if (!link || !link.startsWith('https://')) continue;
      if (exclude?.has(link)) continue;
      return { link, title: page.title?.replace(/^File:/, '') ?? undefined };
    }
    return null;
  } catch (error) {
    log.warn({ err: error, query }, 'Wikimedia image search error');
    return null;
  }
}

function hashToPalette(seed: string): { a: string; b: string; accent: string } {
  const h = createHash('sha256').update(seed).digest();
  const hue = h[0]! % 360;
  const hue2 = (hue + 40 + (h[1]! % 40)) % 360;
  const accentHue = (hue + 180) % 360;
  return {
    a: `hsl(${hue} 42% 28%)`,
    b: `hsl(${hue2} 38% 40%)`,
    accent: `hsl(${accentHue} 45% 78%)`,
  };
}

function buildSvgIllustration(label: string, seed: string): Buffer {
  const safe = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 48);
  const { a, b, accent } = hashToPalette(seed);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="480" fill="url(#g)"/>
  <circle cx="640" cy="120" r="80" fill="${accent}" opacity="0.28"/>
  <circle cx="160" cy="360" r="100" fill="${accent}" opacity="0.18"/>
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

async function tryPersistRemoteImage(options: {
  hit: ImageHit;
  provider: 'google_images' | 'wikimedia';
  query: string;
  alt: string;
  userId: string;
  roadmapId: string;
  nodeId: string;
  fetchedAt: string;
}): Promise<LessonMediaAsset | null> {
  try {
    const imageResponse = await fetch(options.hit.link, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'HobbyFlow/1.0 (lesson-media; educational)' },
    });
    if (!imageResponse.ok) return null;

    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    if (contentType.includes('svg')) return null;

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
        title: options.hit.title ?? options.alt,
        alt: options.alt,
        source: {
          provider: options.provider,
          searchQuery: options.query,
          sourceUrl: uploaded.url,
          fetchedAt: options.fetchedAt,
        },
      };
    }

    if (options.hit.link.startsWith('https://') && !isSearchResultsUrl(options.hit.link)) {
      return {
        id: randomUUID(),
        kind: 'image',
        url: options.hit.link,
        title: options.hit.title ?? options.alt,
        alt: options.alt,
        source: {
          provider: options.provider,
          searchQuery: options.query,
          sourceUrl: options.hit.link,
          fetchedAt: options.fetchedAt,
        },
      };
    }
  } catch (error) {
    log.warn({ err: error, provider: options.provider }, 'Remote image download failed');
  }
  return null;
}

export async function resolveLessonImage(options: {
  query: string;
  alt: string;
  userId: string;
  roadmapId: string;
  nodeId: string;
  /** Skip these remote URLs so pages don't reuse the same photo. */
  excludeUrls?: Set<string>;
}): Promise<LessonMediaAsset> {
  const fetchedAt = new Date().toISOString();
  const excludeUrls = options.excludeUrls ?? new Set<string>();

  const googleHit = await searchGoogleImages(options.query, { excludeUrls });
  if (googleHit) {
    const asset = await tryPersistRemoteImage({
      hit: googleHit,
      provider: 'google_images',
      query: options.query,
      alt: options.alt,
      userId: options.userId,
      roadmapId: options.roadmapId,
      nodeId: options.nodeId,
      fetchedAt,
    });
    if (asset) return asset;
  }

  const wikiHit = await searchWikimediaImages(options.query, { excludeUrls });
  if (wikiHit) {
    const asset = await tryPersistRemoteImage({
      hit: wikiHit,
      provider: 'wikimedia',
      query: options.query,
      alt: options.alt,
      userId: options.userId,
      roadmapId: options.roadmapId,
      nodeId: options.nodeId,
      fetchedAt,
    });
    if (asset) return asset;
  }

  const seed = `${options.roadmapId}:${options.nodeId}:${options.query}:${options.alt}`;
  const svg = buildSvgIllustration(options.alt || options.query, seed);
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

  const jpegUrl = placeholderJpegUrl(seed);
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
