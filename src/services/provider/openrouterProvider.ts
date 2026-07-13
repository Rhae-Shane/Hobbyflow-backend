import { env } from '../../config/env';
import { traceLlmCall } from '../../lib/tracing';
import type { PlanRequest } from '../../schemas/planRequest.schema';
import type { ReplaceRequest } from '../../schemas/replaceRequest.schema';
import {
  buildReplaceSystemPrompt,
  buildReplaceUserPrompt,
  buildRoadmapSystemPrompt,
  buildRoadmapUserPrompt,
} from '../planner/promptBuilder';
import {
  validateRawPlanResponse,
  validateRawTechniqueResponse,
  type RawPlanResponse,
  type RawTechniqueResponse,
} from '../planner/validator';
import type { AIProvider } from './aiProvider.interface';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 20_000;

type ChatMessage = { role: 'system' | 'user'; content: string };

async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hobbyflow.app',
        'X-Title': 'HobbyFlow',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenRouter API returned empty content');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenRouter API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const tracedCallOpenRouter = traceLlmCall(callOpenRouter, {
  name: 'openrouter_plan_completion',
  provider: 'openrouter',
  model: env.OPENROUTER_MODEL || 'openrouter/free',
});

async function callWithJsonRetry<T>(
  messages: ChatMessage[],
  validate: (data: unknown) => T,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await tracedCallOpenRouter(messages);
      const data = JSON.parse(content) as unknown;
      return validate(data);
    } catch (error) {
      lastError = error;
      const isMalformedJson = error instanceof SyntaxError;
      if (!isMalformedJson || attempt === 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed');
}

export function createOpenRouterProvider(): AIProvider {
  return {
    async generateRoadmap(input: PlanRequest): Promise<RawPlanResponse> {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildRoadmapSystemPrompt(input.hobby, input.learnerContext) },
        { role: 'user', content: buildRoadmapUserPrompt(input) },
      ];
      return callWithJsonRetry(messages, validateRawPlanResponse);
    },

    async suggestReplacement(input: ReplaceRequest): Promise<RawTechniqueResponse> {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildReplaceSystemPrompt(input.hobby) },
        { role: 'user', content: buildReplaceUserPrompt(input) },
      ];
      return callWithJsonRetry(messages, validateRawTechniqueResponse);
    },
  };
}
