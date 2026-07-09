import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { invokeChatModel, streamChatModel } from '../llm';
import { buildChatSystemPrompt } from '../prompts';

export type ChatGraphContext = {
  hobby?: string;
};

function withSystemMessage(
  messages: typeof MessagesAnnotation.State['messages'],
  hobby?: string,
) {
  const hasSystem = messages.some((message) => message.getType() === 'system');
  if (hasSystem) {
    return messages;
  }

  return [new SystemMessage(buildChatSystemPrompt(hobby)), ...messages];
}

async function callModel(state: typeof MessagesAnnotation.State, hobby?: string) {
  const messages = withSystemMessage(state.messages, hobby);
  const response = await invokeChatModel(messages);
  return { messages: [response] };
}

export function createChatGraph(context: ChatGraphContext = {}) {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state) => callModel(state, context.hobby))
    .addEdge(START, 'agent')
    .addEdge('agent', END);

  return graph.compile();
}

/**
 * Stream tokens directly from the LLM (bypasses full graph invoke) for lower latency SSE.
 * The compiled graph is still used for non-streaming invoke and future tool nodes.
 */
export async function* streamChatGraph(
  state: typeof MessagesAnnotation.State,
  context: ChatGraphContext = {},
) {
  const messages = withSystemMessage(state.messages, context.hobby);
  let content = '';

  for await (const chunk of streamChatModel(messages)) {
    const delta = typeof chunk.content === 'string' ? chunk.content : '';
    if (delta) {
      content += delta;
      yield delta;
    }
  }

  return new AIMessage(content);
}
