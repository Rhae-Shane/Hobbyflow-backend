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

const AI_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const TIMEOUT_MS = 20_000;

type ChatMessage = { role: 'system' | 'user'; content: string };

async function callAiGateway(messages: ChatMessage[]): Promise<string> {
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(AI_GATEWAY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_GATEWAY_MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vercel AI Gateway error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Vercel AI Gateway returned empty content');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Vercel AI Gateway request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const tracedCallAiGateway = traceLlmCall(callAiGateway, {
  name: 'ai_gateway_plan_completion',
  provider: 'vercel-ai-gateway',
  model: env.AI_GATEWAY_MODEL || 'google/gemini-2.5-flash-lite',
});

async function callWithJsonRetry<T>(
  messages: ChatMessage[],
  validate: (data: unknown) => T,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await tracedCallAiGateway(messages);
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

  throw lastError instanceof Error ? lastError : new Error('Vercel AI Gateway request failed');
}

export function createAiGatewayProvider(): AIProvider {
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
