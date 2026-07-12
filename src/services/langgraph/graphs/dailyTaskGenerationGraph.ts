import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  dailyTaskAgentOutputSchema,
  type DailyTaskAgentOutput,
} from '../../../schemas/dailyTasks.schema';
import { createChildLogger } from '../../../lib/logger';
import { invokeChatModel } from '../llm';
import {
  buildDailyTaskSystemPrompt,
  buildDailyTaskUserPrompt,
} from '../prompts/dailyTaskPrompts';

const log = createChildLogger({ module: 'dailyTaskGenerationGraph' });

export type DailyTaskContext = {
  mode: 'primary' | 'regenerate' | 'bonus';
  taskDate: string;
  hobbies: Array<{ id: string; name: string }>;
  recentCompleted: Array<{ title: string; hobbyName?: string | null; taskDate: string }>;
  discardedTitles: string[];
  progress: {
    currentStreak: number;
    rating: number;
    roadmaps: Array<{ title: string; hobbyName?: string | null; pendingLessons: string[] }>;
  };
};

export type DailyTaskGenerationGraphInput = {
  userId: string;
  context: DailyTaskContext;
};

const DailyTaskState = Annotation.Root({
  userId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  context: Annotation<DailyTaskContext | null>({ reducer: (_, r) => r, default: () => null }),
  output: Annotation<DailyTaskAgentOutput | null>({ reducer: (_, r) => r, default: () => null }),
});

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parseDailyTaskAgentOutput(raw: string): DailyTaskAgentOutput {
  const extracted = extractJsonObject(raw);
  const sanitized = extracted.replace(/[\u0000-\u001f]+/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return ' ';
  });
  const parsed = JSON.parse(sanitized) as unknown;
  return dailyTaskAgentOutputSchema.parse(parsed);
}

function fallbackOutput(context: DailyTaskContext): DailyTaskAgentOutput {
  const hobby = context.hobbies[0]!;
  const pending = context.progress.roadmaps.find((r) => r.pendingLessons.length > 0);
  if (pending) {
    return {
      title: `Complete 1 lesson in ${hobby.name}`,
      hobby_id: hobby.id,
      task_type: 'complete_lesson',
      rationale: 'fallback',
    };
  }
  return {
    title: `Practice ${hobby.name} for 15 minutes`,
    hobby_id: hobby.id,
    task_type: 'practice_minutes',
    minutes: 15,
    rationale: 'fallback',
  };
}

function validateAgainstContext(
  output: DailyTaskAgentOutput,
  context: DailyTaskContext,
): DailyTaskAgentOutput {
  const hobbyIds = new Set(context.hobbies.map((h) => h.id));
  if (!hobbyIds.has(output.hobby_id)) {
    throw new Error('hobby_id is not one of the user hobbies');
  }
  if (output.task_type === 'practice_minutes' && output.minutes == null) {
    return { ...output, minutes: 15 };
  }
  return output;
}

async function generateNode(
  state: typeof DailyTaskState.State,
): Promise<Partial<typeof DailyTaskState.State>> {
  const context = state.context;
  if (!context || context.hobbies.length === 0) {
    throw new Error('No hobbies available for daily task generation');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeChatModel([
        new SystemMessage(buildDailyTaskSystemPrompt()),
        new HumanMessage(buildDailyTaskUserPrompt(context)),
      ]);
      const raw =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      const parsed = validateAgainstContext(parseDailyTaskAgentOutput(raw), context);
      return { output: parsed };
    } catch (error) {
      log.warn({ err: error, attempt, userId: state.userId }, 'daily task generate attempt failed');
    }
  }

  return { output: validateAgainstContext(fallbackOutput(context), context) };
}

export function createDailyTaskGenerationGraph() {
  return new StateGraph(DailyTaskState)
    .addNode('generate', generateNode)
    .addEdge(START, 'generate')
    .addEdge('generate', END)
    .compile();
}

export async function invokeDailyTaskGenerationGraph(
  input: DailyTaskGenerationGraphInput,
): Promise<DailyTaskAgentOutput> {
  const graph = createDailyTaskGenerationGraph();
  const result = await graph.invoke(
    {
      userId: input.userId,
      context: input.context,
      output: null,
    },
    {
      runName: 'daily-task-generation',
      tags: ['daily-task', 'hobbyflow'],
      metadata: {
        userId: input.userId,
        mode: input.context.mode,
        taskDate: input.context.taskDate,
      },
    },
  );

  if (result.output) {
    return result.output;
  }

  if (input.context.hobbies.length > 0) {
    return validateAgainstContext(fallbackOutput(input.context), input.context);
  }

  throw new Error('Daily task generation failed');
}
