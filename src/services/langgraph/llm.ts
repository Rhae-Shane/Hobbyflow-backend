import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { env } from '../../config/env';
import { createChildLogger } from '../../lib/logger';

const log = createChildLogger({ module: 'langgraph.llm' });

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';
const CHAT_TIMEOUT_MS = 30_000;

export function createGroqChatModel(): BaseChatModel | null {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  return new ChatGroq({
    apiKey: env.GROQ_API_KEY,
    model: GROQ_MODEL,
    temperature: 0.7,
    maxRetries: 1,
    timeout: CHAT_TIMEOUT_MS,
  }) as unknown as BaseChatModel;
}

export function createGeminiChatModel(): BaseChatModel | null {
  if (!env.GEMINI_API_KEY) {
    return null;
  }

  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: GEMINI_MODEL,
    temperature: 0.7,
    maxRetries: 1,
  }) as unknown as BaseChatModel;
}

export async function invokeChatModel(messages: BaseMessage[]) {
  const groq = createGroqChatModel();
  const gemini = createGeminiChatModel();

  if (!groq && !gemini) {
    throw new Error('No chat model API keys configured');
  }

  if (groq) {
    try {
      return await groq.invoke(messages);
    } catch (error) {
      log.warn({ err: error }, 'Groq chat failed, trying Gemini');
    }
  }

  if (gemini) {
    return gemini.invoke(messages);
  }

  throw new Error('All chat providers failed');
}

export async function* streamChatModel(messages: BaseMessage[]) {
  const groq = createGroqChatModel();
  const gemini = createGeminiChatModel();

  if (!groq && !gemini) {
    throw new Error('No chat model API keys configured');
  }

  if (groq) {
    try {
      const stream = await groq.stream(messages);
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    } catch (error) {
      log.warn({ err: error }, 'Groq chat stream failed, trying Gemini');
    }
  }

  if (gemini) {
    const stream = await gemini.stream(messages);
    for await (const chunk of stream) {
      yield chunk;
    }
    return;
  }

  throw new Error('All chat providers failed');
}
