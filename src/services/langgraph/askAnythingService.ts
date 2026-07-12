import { traceable } from 'langsmith/traceable';
import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import type { AskAnythingRequest } from '../../schemas/askAnything.schema';
import { persistAskTurn } from '../ask/askConversationService';
import { invokeAskAnythingGraph } from './graphs/askAnythingGraph';

const log = createChildLogger({ module: 'ask-anything' });

export class AskAnythingUnavailableError extends AppError {
  constructor(message = 'Ask Anything is temporarily unavailable. Please try again.') {
    super(503, ErrorCodes.CHAT_UNAVAILABLE, message);
    this.name = 'AskAnythingUnavailableError';
  }
}

async function invokeInner(
  input: AskAnythingRequest,
  userId: string,
): Promise<{
  message: { role: 'assistant'; content: string };
  conversationId: string;
  toolsUsed: string[];
}> {
  const graphResult = await invokeAskAnythingGraph({
    userId,
    message: input.message,
    messages: input.messages,
    activeHobbyHint: input.activeHobbyHint,
    localDate: input.localDate,
  });

  const conversationId = await persistAskTurn({
    userId,
    conversationId: input.conversationId,
    userMessage: input.message,
    assistantMessage: graphResult.content,
    priorMessages: input.messages,
    activeHobbyHint: input.activeHobbyHint,
    toolsUsed: graphResult.toolsUsed,
  });

  log.info(
    {
      userId,
      conversationId,
      toolsUsed: graphResult.toolsUsed,
      messageCount: input.messages.length + 1,
    },
    'Ask Anything turn completed',
  );

  return {
    message: { role: 'assistant', content: graphResult.content },
    conversationId,
    toolsUsed: graphResult.toolsUsed,
  };
}

export const invokeAskAnything = traceable(invokeInner, {
  name: 'ask-anything',
  run_type: 'chain',
});

export async function invokeAskAnythingSafe(input: AskAnythingRequest, userId: string) {
  try {
    return await invokeAskAnything(input, userId);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    log.error({ err: error, userId }, 'Ask Anything invoke failed');
    throw new AskAnythingUnavailableError();
  }
}
