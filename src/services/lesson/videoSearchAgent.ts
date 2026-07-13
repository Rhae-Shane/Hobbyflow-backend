import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChildLogger } from '../../lib/logger';
import type { LessonMediaAsset } from '../../schemas/lessonContent.schema';
import { invokeChatModel } from '../langgraph/llm';
import {
  buildEmptyResultsRefinePrompt,
  buildVideoJudgeSystemPrompt,
  buildVideoJudgeUserPrompt,
  type VideoJudgeDecision,
} from './videoSearchPrompts';
import {
  buildYouTubeMediaAsset,
  ensureHobbyInQuery,
  searchYouTubeCandidates,
  type YouTubeCandidate,
} from './youtubeCandidates';

const log = createChildLogger({ module: 'videoSearchAgent' });

export const MAX_VIDEO_SEARCH_ATTEMPTS = 3;

export type VideoSearchAgentInput = {
  initialQuery: string;
  kind: 'video' | 'audio';
  hobby: string;
  lessonName: string;
  maxAttempts?: number;
};

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/** Exported for unit tests. */
export function parseVideoJudgeDecision(raw: string): VideoJudgeDecision | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    if (parsed.decision === 'select' && typeof parsed.videoId === 'string' && parsed.videoId.trim()) {
      return { decision: 'select', videoId: parsed.videoId.trim() };
    }
    if (
      parsed.decision === 'reject' &&
      typeof parsed.nextQuery === 'string' &&
      parsed.nextQuery.trim()
    ) {
      return {
        decision: 'reject',
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'rejected',
        nextQuery: parsed.nextQuery.trim(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function heuristicFallbackSelect(
  candidates: YouTubeCandidate[],
  hobby: string,
  lessonName: string,
): YouTubeCandidate | null {
  if (candidates.length === 0) return null;

  const offTopic =
    /\b(python|javascript|java\b|coding|programming|computer science|cs50|software engineer|leetcode)\b/i;
  const hobbyToken = hobby.trim().toLowerCase();
  const lessonToken = lessonName.trim().toLowerCase();

  const scored = candidates
    .filter((c) => !offTopic.test(`${c.title} ${c.description} ${c.channelTitle}`))
    .map((c) => {
      const hay = `${c.title} ${c.description}`.toLowerCase();
      let score = 0;
      if (hobbyToken && hay.includes(hobbyToken)) score += 3;
      if (lessonToken && hay.includes(lessonToken)) score += 2;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 0) return scored[0].c;
  // Prefer any non-off-topic candidate over inventing media
  return scored[0]?.c ?? null;
}

function defaultRefineQuery(hobby: string, lessonName: string, kind: 'video' | 'audio'): string {
  const base = [hobby, lessonName].filter(Boolean).join(' ').trim() || hobby || 'hobby skill';
  return kind === 'audio'
    ? `${base} play along podcast listen`
    : `${base} beginner tutorial lesson`;
}

async function judgeCandidates(input: {
  hobby: string;
  lessonName: string;
  kind: 'video' | 'audio';
  searchQuery: string;
  candidates: YouTubeCandidate[];
  attempt: number;
  maxAttempts: number;
}): Promise<VideoJudgeDecision> {
  const system = new SystemMessage(buildVideoJudgeSystemPrompt());
  const user = new HumanMessage(
    input.candidates.length === 0
      ? buildEmptyResultsRefinePrompt(input)
      : buildVideoJudgeUserPrompt({
          ...input,
          candidates: input.candidates.map((c) => ({
            videoId: c.videoId,
            title: c.title,
            channelTitle: c.channelTitle,
            description: c.description,
          })),
        }),
  );

  try {
    const response = await invokeChatModel([system, user]);
    const raw =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const decision = parseVideoJudgeDecision(raw);
    if (decision) return decision;
  } catch (error) {
    log.warn({ err: error, attempt: input.attempt }, 'video judge LLM failed');
  }

  // LLM failed — heuristic pick or refine
  const picked = heuristicFallbackSelect(input.candidates, input.hobby, input.lessonName);
  if (picked) {
    return { decision: 'select', videoId: picked.videoId };
  }

  return {
    decision: 'reject',
    reason: 'judge unavailable',
    nextQuery: defaultRefineQuery(input.hobby, input.lessonName, input.kind),
  };
}

/**
 * Search → LLM judge → refine query retry loop (max 3 attempts).
 * Only returns a video whose id appeared in the candidate set for that attempt.
 */
export async function runVideoSearchAgent(
  input: VideoSearchAgentInput,
): Promise<LessonMediaAsset | null> {
  const maxAttempts = input.maxAttempts ?? MAX_VIDEO_SEARCH_ATTEMPTS;
  let searchQuery = ensureHobbyInQuery(input.hobby, input.initialQuery);

  if (!searchQuery) {
    log.warn({ kind: input.kind }, 'Empty YouTube search query — skipping media');
    return null;
  }

  const triedQueries = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    searchQuery = ensureHobbyInQuery(input.hobby, searchQuery);
    if (triedQueries.has(searchQuery.toLowerCase()) && attempt > 1) {
      searchQuery = ensureHobbyInQuery(
        input.hobby,
        defaultRefineQuery(input.hobby, input.lessonName, input.kind) + ` tip ${attempt}`,
      );
    }
    triedQueries.add(searchQuery.toLowerCase());

    const candidates = await searchYouTubeCandidates(searchQuery);
    log.info(
      {
        kind: input.kind,
        attempt,
        searchQuery,
        candidateCount: candidates.length,
        hobby: input.hobby,
        lessonName: input.lessonName,
      },
      'video_search_attempt',
    );

    const decision = await judgeCandidates({
      hobby: input.hobby,
      lessonName: input.lessonName,
      kind: input.kind,
      searchQuery,
      candidates,
      attempt,
      maxAttempts,
    });

    if (decision.decision === 'select') {
      const selected = candidates.find((c) => c.videoId === decision.videoId);
      if (selected) {
        return buildYouTubeMediaAsset({
          kind: input.kind,
          videoId: selected.videoId,
          title: selected.title,
          searchQuery,
        });
      }
      log.warn(
        { videoId: decision.videoId, attempt },
        'judge selected id not in candidates — treating as reject',
      );
    }

    const next =
      decision.decision === 'reject'
        ? decision.nextQuery
        : defaultRefineQuery(input.hobby, input.lessonName, input.kind);

    searchQuery = ensureHobbyInQuery(input.hobby, next);
    log.info(
      {
        attempt,
        reason: decision.decision === 'reject' ? decision.reason : 'invalid select',
        nextQuery: searchQuery,
      },
      'video_search_refine',
    );
  }

  log.warn(
    { kind: input.kind, hobby: input.hobby, lessonName: input.lessonName },
    'video search agent exhausted attempts — skipping media',
  );
  return null;
}
