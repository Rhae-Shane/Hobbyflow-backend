import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatMessage } from '../../schemas/chatRequest.schema';

export function toLangChainMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    switch (message.role) {
      case 'user':
        return new HumanMessage(message.content);
      case 'assistant':
        return new AIMessage(message.content);
      case 'system':
        return new SystemMessage(message.content);
    }
  });
}

export function toApiMessage(message: { role: string; content: unknown }) {
  const content =
    typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((part) =>
              typeof part === 'object' && part !== null && 'text' in part
                ? String((part as { text?: string }).text ?? '')
                : '',
            )
            .join('')
        : String(message.content ?? '');

  return {
    role: message.role as ChatMessage['role'],
    content,
  };
}
