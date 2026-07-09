import { env } from '../../config/env';
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

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const TIMEOUT_MS = 8000;

type ChatMessage = { role: 'system' | 'user'; content: string };

async function callGemini(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role === 'user');

  try {
    const url = `${GEMINI_API_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemMessage
          ? { systemInstruction: { parts: [{ text: systemMessage.content }] } }
          : {}),
        contents: userMessages.map((message) => ({
          role: 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Gemini API returned empty content');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callWithJsonRetry<T>(
  messages: ChatMessage[],
  validate: (data: unknown) => T,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await callGemini(messages);
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

  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}

export function createGeminiProvider(): AIProvider {
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
