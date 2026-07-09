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

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 8000;

type ChatMessage = { role: 'system' | 'user'; content: string };

async function callGroq(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Groq API returned empty content');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Groq API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const tracedCallGroq = traceLlmCall(callGroq, {
  name: 'groq_plan_completion',
  provider: 'groq',
  model: MODEL,
});

async function callWithJsonRetry<T>(
  messages: ChatMessage[],
  validate: (data: unknown) => T,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await tracedCallGroq(messages);
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

  throw lastError instanceof Error ? lastError : new Error('Groq request failed');
}

export function createGroqProvider(): AIProvider {
  return {
    async generateRoadmap(input: PlanRequest): Promise<RawPlanResponse> {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildRoadmapSystemPrompt(input.hobby) },
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
