import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { env } from '../../config/env';
import { createChildLogger } from '../../lib/logger';

const log = createChildLogger({ module: 'langgraph.llm' });

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';
const CHAT_TIMEOUT_MS = 30_000;
const MAX_TOOL_ITERATIONS = 6;
/** Short TPM waits (e.g. "try again in 755ms") — retry same provider before failover */
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_DEFAULT_WAIT_MS = 1_500;
const RATE_LIMIT_MAX_WAIT_MS = 45_000;

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    status?: number;
    code?: string;
    message?: string;
    error?: { code?: string; type?: string; message?: string };
  };
  const message = `${err.message ?? ''} ${err.error?.message ?? ''}`.toLowerCase();
  return (
    err.status === 429 ||
    err.code === 'rate_limit_exceeded' ||
    err.error?.code === 'rate_limit_exceeded' ||
    err.error?.type === 'tokens' ||
    message.includes('rate limit') ||
    message.includes('tokens per minute') ||
    message.includes('quota exceeded') ||
    message.includes('too many requests')
  );
}

function parseRetryDelayMs(error: unknown): number {
  const message =
    error && typeof error === 'object'
      ? `${(error as { message?: string }).message ?? ''} ${
          (error as { error?: { message?: string } }).error?.message ?? ''
        }`
      : String(error ?? '');

  const msMatch = message.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) {
    return Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.ceil(Number(msMatch[1]) + 200));
  }
  const secMatch = message.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (secMatch) {
    return Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.ceil(Number(secMatch[1]) * 1000 + 250));
  }
  const retryInfo = message.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryInfo) {
    return Math.min(RATE_LIMIT_MAX_WAIT_MS, Number(retryInfo[1]) * 1000 + 250);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeWithRateLimitRetry<T>(
  providerName: string,
  run: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRIES) {
        throw error;
      }
      const waitMs = parseRetryDelayMs(error);
      log.warn(
        { provider: providerName, attempt, waitMs },
        'Provider rate-limited, waiting before retry',
      );
      await sleep(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Provider retries exhausted');
}

function createGroqChatModelWithKey(apiKey: string): BaseChatModel {
  return new ChatGroq({
    apiKey,
    model: GROQ_MODEL,
    temperature: 0.7,
    // We handle short TPM waits ourselves in invokeWithRateLimitRetry
    maxRetries: 0,
    timeout: CHAT_TIMEOUT_MS,
  }) as unknown as BaseChatModel;
}

/** Round-robin start index so successive requests spread across keys. */
let groqKeyCursor = 0;

function orderedGroqKeys(): string[] {
  const keys = env.GROQ_API_KEYS;
  if (keys.length <= 1) return keys;
  const start = groqKeyCursor % keys.length;
  groqKeyCursor = (groqKeyCursor + 1) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function createGroqChatModel(): BaseChatModel | null {
  const key = env.GROQ_API_KEYS[0] ?? env.GROQ_API_KEY;
  if (!key) return null;
  return createGroqChatModelWithKey(key);
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

type ProviderSlot = { name: string; model: BaseChatModel; keyIndex?: number };

function buildProviderChain(): ProviderSlot[] {
  const providers: ProviderSlot[] = [];
  for (const [index, key] of orderedGroqKeys().entries()) {
    providers.push({
      name: `groq#${index + 1}`,
      model: createGroqChatModelWithKey(key),
      keyIndex: index,
    });
  }
  const gemini = createGeminiChatModel();
  if (gemini) {
    providers.push({ name: 'gemini', model: gemini });
  }
  return providers;
}

export async function invokeChatModel(messages: BaseMessage[]) {
  const providers = buildProviderChain();
  if (providers.length === 0) {
    throw new Error('No chat model API keys configured');
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await invokeWithRateLimitRetry(provider.name, () => provider.model.invoke(messages));
    } catch (error) {
      lastError = error;
      const rateLimited = isRateLimitError(error);
      log.warn(
        {
          err: error,
          provider: provider.name,
          rateLimited,
          groqKeyCount: env.GROQ_API_KEYS.length,
        },
        rateLimited
          ? 'Provider rate-limited after retries, trying next key/provider'
          : 'Chat provider failed, trying next',
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All chat providers failed');
}

async function runToolCall(
  toolsByName: Map<string, StructuredToolInterface>,
  name: string,
  args: unknown,
): Promise<string> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
  try {
    const result = await tool.invoke(args ?? {});
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (error) {
    log.warn({ err: error, tool: name }, 'Tool invocation failed');
    return JSON.stringify({ error: `Tool ${name} failed` });
  }
}

/**
 * Invoke chat model with tools bound; execute tool calls until the model returns text (or max iterations).
 */
export async function invokeChatModelWithTools(
  messages: BaseMessage[],
  tools: StructuredToolInterface[],
  options?: { onToolCall?: (name: string) => void },
): Promise<AIMessage> {
  const providers = buildProviderChain();
  if (providers.length === 0) {
    throw new Error('No chat model API keys configured');
  }

  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const modelWithTools = provider.model.bindTools
        ? provider.model.bindTools(tools)
        : provider.model;
      let current: BaseMessage[] = [...messages];

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
        const response = await invokeWithRateLimitRetry(provider.name, () =>
          modelWithTools.invoke(current),
        );
        const aiMessage =
          response instanceof AIMessage
            ? response
            : new AIMessage({
                content:
                  typeof response.content === 'string'
                    ? response.content
                    : String(response.content ?? ''),
                tool_calls: (response as AIMessage).tool_calls,
              });

        const toolCalls = aiMessage.tool_calls ?? [];
        if (toolCalls.length === 0) {
          return aiMessage;
        }

        current = [...current, aiMessage];
        for (const call of toolCalls) {
          options?.onToolCall?.(call.name);
          const toolResult = await runToolCall(toolsByName, call.name, call.args);
          current.push(
            new ToolMessage({
              content: toolResult,
              tool_call_id: call.id ?? `${call.name}-${i}`,
            }),
          );
        }
      }

      throw new Error('Tool-calling loop exceeded max iterations');
    } catch (error) {
      lastError = error;
      log.warn(
        {
          err: error,
          provider: provider.name,
          rateLimited: isRateLimitError(error),
        },
        'Chat provider with tools failed, trying next',
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All chat providers failed');
}

export async function* streamChatModel(messages: BaseMessage[]) {
  const providers = buildProviderChain();
  if (providers.length === 0) {
    throw new Error('No chat model API keys configured');
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const stream = await provider.model.stream(messages);
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    } catch (error) {
      lastError = error;
      log.warn(
        {
          err: error,
          provider: provider.name,
          rateLimited: isRateLimitError(error),
        },
        'Chat stream failed, trying next provider',
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All chat providers failed');
}
