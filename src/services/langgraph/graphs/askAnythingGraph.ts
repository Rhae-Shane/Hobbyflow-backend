import { SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { invokeChatModelWithTools } from '../llm';
import { buildAskAnythingSystemPrompt } from '../prompts/askAnythingPrompts';
import { createAskAnythingTools } from '../tools/askAnythingTools';
import { toLangChainMessages } from '../messageMapper';

export type AskAnythingGraphInput = {
  userId: string;
  message: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeHobbyHint?: string;
  localDate?: string;
};

const AskState = Annotation.Root({
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  userId: Annotation<string>(),
  activeHobbyHint: Annotation<string | undefined>(),
  localDate: Annotation<string | undefined>(),
  toolsUsed: Annotation<string[]>({
    reducer: (left, right) => Array.from(new Set([...(left ?? []), ...(right ?? [])])),
    default: () => [],
  }),
  assistantContent: Annotation<string>({
    reducer: (_l, r) => r,
    default: () => '',
  }),
});

function messageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return String(content ?? '');
}

export function createAskAnythingGraph() {
  const graph = new StateGraph(AskState)
    .addNode('agent', async (state) => {
      const tools = createAskAnythingTools({
        userId: state.userId,
        localDate: state.localDate,
      });

      const history = toLangChainMessages(
        state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );

      const system = new SystemMessage(
        buildAskAnythingSystemPrompt({
          activeHobbyHint: state.activeHobbyHint,
          localDate: state.localDate,
        }),
      );

      const toolsUsed: string[] = [];
      const response = await invokeChatModelWithTools([system, ...history], tools, {
        onToolCall: (name) => {
          toolsUsed.push(name);
        },
      });

      return {
        assistantContent: messageContent(response.content),
        toolsUsed,
      };
    })
    .addEdge(START, 'agent')
    .addEdge('agent', END);

  return graph.compile();
}

export async function invokeAskAnythingGraph(input: AskAnythingGraphInput): Promise<{
  content: string;
  toolsUsed: string[];
}> {
  const prior = input.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const withLatest = [
    ...prior,
    { role: 'user' as const, content: input.message },
  ];

  const graph = createAskAnythingGraph();
  const result = await graph.invoke(
    {
      messages: withLatest,
      userId: input.userId,
      activeHobbyHint: input.activeHobbyHint,
      localDate: input.localDate,
      toolsUsed: [],
      assistantContent: '',
    },
    {
      runName: 'ask-anything',
      tags: ['ask-anything', 'hobbyflow'],
      metadata: {
        userId: input.userId,
        messageCount: withLatest.length,
      },
    },
  );

  const content = result.assistantContent?.trim();
  if (!content) {
    throw new Error('Empty ask-anything response');
  }

  return {
    content,
    toolsUsed: result.toolsUsed ?? [],
  };
}
