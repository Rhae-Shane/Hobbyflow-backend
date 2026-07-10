import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  MAX_CLARIFICATION_ROUNDS,
  MIN_CLARIFICATION_ROUNDS,
  type RoadmapCreationChatRequest,
  type RoadmapCreationChatResponse,
  type RoadmapCreationFlowState,
} from '../../../schemas/roadmapCreationChat.schema';
import { invokeChatModel } from '../llm';
import { toLangChainMessages } from '../messageMapper';
import {
  buildClarificationUserPrompt,
  buildRefineGoalPrompt,
  buildRoadmapCreationSystemPrompt,
  buildSynthesizeGoalPrompt,
  type RoadmapCreationPromptContext,
} from '../prompts/roadmapCreationPrompts';
import { parseRoadmapCreationResponse } from '../responseParser';

export type RoadmapCreationGraphInput = RoadmapCreationChatRequest & {
  learnerContextSummary?: string;
};

export const RoadmapCreationState = Annotation.Root({
  conversationMessages: Annotation<(HumanMessage | AIMessage)[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  flowState: Annotation<RoadmapCreationFlowState>({
    reducer: (_, right) => right,
    default: () => 'collecting-input',
  }),
  clarificationRound: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  userRoles: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  isFirstRoadmap: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => true,
  }),
  learnerContextSummary: Annotation<string>({
    reducer: (_, right) => right,
    default: () => '',
  }),
  roadmapName: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  roadmapGoal: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  roadmapBackground: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  structuredResponse: Annotation<RoadmapCreationChatResponse | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  parseAttempt: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  rawContent: Annotation<string>({
    reducer: (_, right) => right,
    default: () => '',
  }),
});

export function countClarificationRounds(
  messages: RoadmapCreationChatRequest['messages'],
): number {
  const userCount = messages.filter((m) => m.role === 'user').length;
  return Math.max(0, userCount - 1);
}

function countAnswersFromConversation(
  messages: (HumanMessage | AIMessage)[],
): number {
  const userCount = messages.filter((m) => m.getType() === 'human').length;
  return Math.max(0, userCount - 1);
}

function resolveTurnKind(state: typeof RoadmapCreationState.State): 'clarify' | 'synthesize' | 'refine' {
  if (state.flowState === 'confirming-goal') {
    return 'refine';
  }

  const answerCount = countAnswersFromConversation(state.conversationMessages);
  const assistantCount = state.conversationMessages.filter(
    (m) => m.getType() === 'ai',
  ).length;

  // Hard cap: never ask more than MAX clarification questions
  if (answerCount >= MAX_CLARIFICATION_ROUNDS || assistantCount >= MAX_CLARIFICATION_ROUNDS) {
    return 'synthesize';
  }

  // Default: after MIN user answers (4), produce goal_suggestion (Inspo guitar flow)
  if (answerCount >= MIN_CLARIFICATION_ROUNDS) {
    return 'synthesize';
  }

  return 'clarify';
}

function promptContextFromState(
  state: typeof RoadmapCreationState.State,
): RoadmapCreationPromptContext {
  return {
    userRoles: state.userRoles,
    isFirstRoadmap: state.isFirstRoadmap,
    learnerContextSummary: state.learnerContextSummary,
    clarificationRound: state.clarificationRound,
    roadmapName: state.roadmapName,
    roadmapGoal: state.roadmapGoal,
    roadmapBackground: state.roadmapBackground,
  };
}

function buildTurnInstruction(
  state: typeof RoadmapCreationState.State,
  strictJson = false,
): string {
  const ctx = promptContextFromState(state);
  const turnKind = resolveTurnKind(state);
  let instruction: string;

  switch (turnKind) {
    case 'refine':
      instruction = buildRefineGoalPrompt(ctx);
      break;
    case 'synthesize':
      instruction = buildSynthesizeGoalPrompt();
      break;
    default:
      instruction = buildClarificationUserPrompt(ctx);
  }

  if (strictJson) {
    return `${instruction}\n\nIMPORTANT: Return valid JSON only matching the schema.`;
  }

  return instruction;
}

function buildLlmMessages(state: typeof RoadmapCreationState.State, strictJson = false) {
  const system = new SystemMessage(
    buildRoadmapCreationSystemPrompt(promptContextFromState(state)),
  );
  const instruction = new HumanMessage(buildTurnInstruction(state, strictJson));
  return [system, ...state.conversationMessages, instruction];
}

async function callLlm(state: typeof RoadmapCreationState.State) {
  const response = await invokeChatModel(buildLlmMessages(state));
  const content =
    typeof response.content === 'string' ? response.content : String(response.content ?? '');
  return { rawContent: content, parseAttempt: 0, structuredResponse: null };
}

async function validateStructuredOutput(state: typeof RoadmapCreationState.State) {
  try {
    const structured = parseRoadmapCreationResponse(state.rawContent);
    return { structuredResponse: structured };
  } catch {
    if (state.parseAttempt < 1) {
      return { parseAttempt: state.parseAttempt + 1 };
    }
    throw new Error('Failed to parse roadmap creation response');
  }
}

async function retryLlm(state: typeof RoadmapCreationState.State) {
  const response = await invokeChatModel(buildLlmMessages(state, true));
  const content =
    typeof response.content === 'string' ? response.content : String(response.content ?? '');
  return { rawContent: content };
}

async function finalizeResponse(state: typeof RoadmapCreationState.State) {
  const structured = state.structuredResponse;
  if (!structured) {
    throw new Error('Missing structured response');
  }

  let nextFlowState: RoadmapCreationFlowState = state.flowState;
  let clarificationRound = state.clarificationRound;

  if (structured.type === 'clarification') {
    nextFlowState = 'clarifying';
    clarificationRound = state.clarificationRound + 1;
  } else {
    nextFlowState = 'confirming-goal';
  }

  return {
    flowState: nextFlowState,
    clarificationRound,
    conversationMessages: [new AIMessage(structured.message)],
  };
}

function routeAfterValidate(state: typeof RoadmapCreationState.State) {
  if (state.structuredResponse) {
    return 'finalize';
  }
  return 'retry';
}

export function createRoadmapCreationGraph() {
  const graph = new StateGraph(RoadmapCreationState)
    .addNode('call_llm', callLlm)
    .addNode('validate', validateStructuredOutput)
    .addNode('retry', retryLlm)
    .addNode('finalize', finalizeResponse)
    .addEdge(START, 'call_llm')
    .addEdge('call_llm', 'validate')
    .addConditionalEdges('validate', routeAfterValidate, {
      finalize: 'finalize',
      retry: 'retry',
    })
    .addEdge('retry', 'validate')
    .addEdge('finalize', END);

  return graph.compile();
}

export function initialStateFromRequest(
  input: RoadmapCreationGraphInput,
): typeof RoadmapCreationState.State {
  return {
    conversationMessages: toLangChainMessages(input.messages) as (HumanMessage | AIMessage)[],
    flowState: input.flowState,
    clarificationRound: countClarificationRounds(input.messages),
    userRoles: input.userRoles,
    isFirstRoadmap: input.isFirstRoadmap,
    learnerContextSummary: input.learnerContextSummary ?? '',
    roadmapName: input.roadmapName,
    roadmapGoal: input.roadmapGoal,
    roadmapBackground: input.roadmapBackground,
    structuredResponse: null,
    parseAttempt: 0,
    rawContent: '',
  };
}
