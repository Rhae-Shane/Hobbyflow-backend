import { AppError, ErrorCodes } from '../../lib/AppError';
import { createChildLogger } from '../../lib/logger';
import type { ChatRequest } from '../../schemas/chatRequest.schema';
import { createChatGraph, streamChatGraph } from './graphs/chatGraph';
import { toApiMessage, toLangChainMessages } from './messageMapper';

const log = createChildLogger({ module: 'chat' });

export class ChatUnavailableError extends AppError {
  constructor(message = 'Chat is temporarily unavailable. Please try again.') {
    super(503, ErrorCodes.CHAT_UNAVAILABLE, message);
    this.name = 'ChatUnavailableError';
  }
}

export async function invokeChat(input: ChatRequest) {
  const graph = createChatGraph({ hobby: input.hobby });
  const messages = toLangChainMessages(input.messages);

  try {
    const result = await graph.invoke({ messages });
    const lastMessage = result.messages.at(-1);

    if (!lastMessage) {
      throw new ChatUnavailableError();
    }

    log.info(
      { hobby: input.hobby, messageCount: input.messages.length },
      'Chat response generated',
    );

    return {
      message: toApiMessage({
        role: lastMessage.getType() === 'ai' ? 'assistant' : lastMessage.getType(),
        content: lastMessage.content,
      }),
    };
  } catch (error) {
    if (error instanceof ChatUnavailableError) {
      throw error;
    }

    log.error({ err: error, hobby: input.hobby }, 'Chat invoke failed');
    throw new ChatUnavailableError();
  }
}

export async function* streamChat(input: ChatRequest) {
  const messages = toLangChainMessages(input.messages);

  try {
    log.debug(
      { hobby: input.hobby, messageCount: input.messages.length },
      'Chat stream started',
    );

    for await (const delta of streamChatGraph({ messages }, { hobby: input.hobby })) {
      yield { type: 'token' as const, content: delta };
    }

    yield { type: 'done' as const };
    log.info({ hobby: input.hobby }, 'Chat stream completed');
  } catch (error) {
    log.error({ err: error, hobby: input.hobby }, 'Chat stream failed');
    throw new ChatUnavailableError();
  }
}
