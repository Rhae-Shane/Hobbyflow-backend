import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  exerciseAgentBatchOutputSchema,
  exerciseAgentSingleOutputSchema,
  type ExerciseAgentBatchOutput,
  type ExerciseAgentSingleOutput,
} from '../../../schemas/exercises.schema';
import { createChildLogger } from '../../../lib/logger';
import { invokeChatModel } from '../llm';
import {
  buildExerciseSystemPrompt,
  buildExerciseUserPrompt,
  type ExerciseGenerationPromptContext,
} from '../prompts/exercisePrompts';

const log = createChildLogger({ module: 'exerciseGenerationGraph' });

export type ExerciseGenerationContext = ExerciseGenerationPromptContext;

export type ExerciseGenerationGraphInput = {
  userId: string;
  context: ExerciseGenerationContext;
};

export type ExerciseGenerationResult =
  | { mode: 'batch'; output: ExerciseAgentBatchOutput }
  | { mode: 'single_regenerate'; output: ExerciseAgentSingleOutput };

const ExerciseState = Annotation.Root({
  userId: Annotation<string>({ reducer: (_, r) => r, default: () => '' }),
  context: Annotation<ExerciseGenerationContext | null>({
    reducer: (_, r) => r,
    default: () => null,
  }),
  batchOutput: Annotation<ExerciseAgentBatchOutput | null>({
    reducer: (_, r) => r,
    default: () => null,
  }),
  singleOutput: Annotation<ExerciseAgentSingleOutput | null>({
    reducer: (_, r) => r,
    default: () => null,
  }),
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

function sanitizeJsonText(raw: string): string {
  return raw.replace(/[\u0000-\u001f]+/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return ' ';
  });
}

export function parseExerciseBatchOutput(raw: string): ExerciseAgentBatchOutput {
  const parsed = JSON.parse(sanitizeJsonText(extractJsonObject(raw))) as unknown;
  return exerciseAgentBatchOutputSchema.parse(parsed);
}

export function parseExerciseSingleOutput(raw: string): ExerciseAgentSingleOutput {
  const parsed = JSON.parse(sanitizeJsonText(extractJsonObject(raw))) as unknown;
  return exerciseAgentSingleOutputSchema.parse(parsed);
}

function fallbackBatch(context: ExerciseGenerationContext): ExerciseAgentBatchOutput {
  const lesson = context.lesson.name || 'this lesson';
  const hobby = context.hobby.name;
  return {
    exercises: [
      {
        title: `Practice ${lesson}`,
        instructions: `Spend 10–15 minutes practicing the core idea of “${lesson}” for ${hobby}. Focus on one concrete drill tied to: ${context.lesson.hook || context.lesson.meaning || lesson}.`,
      },
      {
        title: `Apply ${lesson}`,
        instructions: `Do one short applied rep of “${lesson}” for ${hobby}. Keep it check-off-able and stop when you have one clear attempt.`,
      },
    ],
  };
}

function fallbackSingle(context: ExerciseGenerationContext): ExerciseAgentSingleOutput {
  const lesson = context.lesson.name || 'this lesson';
  return {
    title: `Fresh drill: ${lesson}`.slice(0, 80),
    instructions: `Try a new practice for “${lesson}” in ${context.hobby.name}. Make one focused attempt based on: ${context.lesson.meaning || context.lesson.hook || lesson}.`,
  };
}

async function generateNode(
  state: typeof ExerciseState.State,
): Promise<Partial<typeof ExerciseState.State>> {
  const context = state.context;
  if (!context) {
    throw new Error('Missing exercise generation context');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeChatModel([
        new SystemMessage(buildExerciseSystemPrompt()),
        new HumanMessage(buildExerciseUserPrompt(context)),
      ]);
      const raw =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      if (context.mode === 'batch') {
        return { batchOutput: parseExerciseBatchOutput(raw), singleOutput: null };
      }
      return { singleOutput: parseExerciseSingleOutput(raw), batchOutput: null };
    } catch (error) {
      log.warn(
        { err: error, attempt, userId: state.userId, mode: context.mode },
        'exercise generate attempt failed',
      );
    }
  }

  if (context.mode === 'batch') {
    return { batchOutput: fallbackBatch(context), singleOutput: null };
  }
  return { singleOutput: fallbackSingle(context), batchOutput: null };
}

export function createExerciseGenerationGraph() {
  return new StateGraph(ExerciseState)
    .addNode('generate', generateNode)
    .addEdge(START, 'generate')
    .addEdge('generate', END)
    .compile();
}

export async function invokeExerciseGenerationGraph(
  input: ExerciseGenerationGraphInput,
): Promise<ExerciseGenerationResult> {
  const graph = createExerciseGenerationGraph();
  const result = await graph.invoke(
    {
      userId: input.userId,
      context: input.context,
      batchOutput: null,
      singleOutput: null,
    },
    {
      runName: 'exercise-generation',
      tags: ['exercise', 'hobbyflow'],
      metadata: {
        userId: input.userId,
        mode: input.context.mode,
        lessonId: input.context.lesson.id,
        hobbyId: input.context.hobby.id,
      },
    },
  );

  if (input.context.mode === 'batch') {
    const output = result.batchOutput ?? fallbackBatch(input.context);
    return { mode: 'batch', output };
  }

  const output = result.singleOutput ?? fallbackSingle(input.context);
  return { mode: 'single_regenerate', output };
}
