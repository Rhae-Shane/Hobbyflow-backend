import { z } from 'zod';
import {
  clarificationResponseSchema,
  goalSuggestionResponseSchema,
  type RoadmapCreationChatResponse,
} from '../../schemas/roadmapCreationChat.schema';

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export function parseRoadmapCreationResponse(raw: string): RoadmapCreationChatResponse {
  const jsonText = extractJsonObject(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('LLM response is not valid JSON');
  }

  const typeResult = z.object({ type: z.string() }).safeParse(parsed);
  if (!typeResult.success) {
    throw new Error('LLM response missing type field');
  }

  if (typeResult.data.type === 'clarification') {
    return clarificationResponseSchema.parse(parsed);
  }

  if (typeResult.data.type === 'goal_suggestion') {
    return goalSuggestionResponseSchema.parse(parsed);
  }

  throw new Error(`Unknown response type: ${typeResult.data.type}`);
}
