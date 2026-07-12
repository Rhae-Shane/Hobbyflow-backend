import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  MAX_CLARIFICATION_ROUNDS,
  MAX_TAG_CLARIFICATION_ROUNDS,
  MIN_CLARIFICATION_ROUNDS,
  type CurrentLessonPlan,
  type HobbyTag,
  type RoadmapCreationChatRequest,
  type RoadmapCreationChatResponse,
  type RoadmapCreationFlowState,
} from '../../../schemas/roadmapCreationChat.schema';
import { invokeChatModel, invokeChatModelWithTools } from '../llm';
import { toLangChainMessages } from '../messageMapper';
import {
  buildClarificationUserPrompt,
  buildLessonPlanOutlinePrompt,
  buildRefineGoalPrompt,
  buildRoadmapCreationSystemPrompt,
  buildSynthesizeGoalPrompt,
  buildTagConfirmPrompt,
  type RoadmapCreationPromptContext,
} from '../prompts/roadmapCreationPrompts';
import { parseRoadmapCreationResponse } from '../responseParser';
import { hobbyCatalogTools } from '../tools/hobbyCatalogTools';

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
  intent: Annotation<'chat' | 'generate_outline'>({
    reducer: (_, right) => right,
    default: () => 'chat',
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
  suggestedTags: Annotation<HobbyTag[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  currentLessonPlan: Annotation<CurrentLessonPlan | null>({
    reducer: (_, right) => right,
    default: () => null,
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

function resolveTurnKind(
  state: typeof RoadmapCreationState.State,
): 'clarify' | 'tag_confirm' | 'synthesize' | 'refine' | 'outline' {
  if (state.intent === 'generate_outline' || state.flowState === 'reviewing-outline') {
    return 'outline';
  }

  if (state.flowState === 'confirming-goal') {
    return 'refine';
  }

  // User already saw matching tags — build the goal card from their selection
  if (state.flowState === 'selecting-tags') {
    return 'synthesize';
  }

  const answerCount = countAnswersFromConversation(state.conversationMessages);
  const assistantCount = state.conversationMessages.filter(
    (m) => m.getType() === 'ai',
  ).length;

  // Past tag budget: force goal synthesis (safety net)
  if (
    answerCount >= MAX_TAG_CLARIFICATION_ROUNDS ||
    assistantCount >= MAX_TAG_CLARIFICATION_ROUNDS
  ) {
    return 'synthesize';
  }

  // After enough MCQs (or at hard MCQ cap), always ask tag confirm first
  if (
    answerCount >= MIN_CLARIFICATION_ROUNDS ||
    assistantCount >= MAX_CLARIFICATION_ROUNDS
  ) {
    return 'tag_confirm';
  }

  return 'clarify';
}

function promptContextFromState(
  state: typeof RoadmapCreationState.State,
): RoadmapCreationPromptContext {
  const turnKind = resolveTurnKind(state);
  return {
    userRoles: state.userRoles,
    isFirstRoadmap: state.isFirstRoadmap,
    learnerContextSummary: state.learnerContextSummary,
    clarificationRound: state.clarificationRound,
    roadmapName: state.roadmapName,
    roadmapGoal: state.roadmapGoal,
    roadmapBackground: state.roadmapBackground,
    suggestedTags: state.suggestedTags,
    currentLessonPlan: state.currentLessonPlan,
    useCatalogTools: turnKind === 'tag_confirm' || turnKind === 'synthesize',
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
    case 'outline':
      instruction = buildLessonPlanOutlinePrompt(ctx);
      break;
    case 'refine':
      instruction = buildRefineGoalPrompt(ctx);
      break;
    case 'tag_confirm':
      instruction = buildTagConfirmPrompt();
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

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  return String(content ?? '');
}

async function callLlm(state: typeof RoadmapCreationState.State) {
  const messages = buildLlmMessages(state);
  const turnKind = resolveTurnKind(state);

  if (turnKind === 'tag_confirm' || turnKind === 'synthesize') {
    try {
      const response = await invokeChatModelWithTools(messages, hobbyCatalogTools);
      return {
        rawContent: messageContentToString(response.content),
        parseAttempt: 0,
        structuredResponse: null,
      };
    } catch {
      // Fall through to plain invoke if tool-calling providers fail
    }
  }

  const response = await invokeChatModel(messages);
  return {
    rawContent: messageContentToString(response.content),
    parseAttempt: 0,
    structuredResponse: null,
  };
}

async function validateStructuredOutput(state: typeof RoadmapCreationState.State) {
  const turnKind = resolveTurnKind(state);

  try {
    const structured = parseRoadmapCreationResponse(state.rawContent);

    // Tag-confirm turn must ask the user — never skip straight to the goal card
    if (turnKind === 'tag_confirm' && structured.type !== 'clarification') {
      if (state.parseAttempt < 1) {
        return { parseAttempt: state.parseAttempt + 1 };
      }
      throw new Error('Tag confirm turn did not return clarification');
    }

    // After tag selection, require a goal card (avoid looping on another MCQ)
    if (turnKind === 'synthesize' && state.flowState === 'selecting-tags' && structured.type === 'clarification') {
      if (state.parseAttempt < 1) {
        return { parseAttempt: state.parseAttempt + 1 };
      }
      throw new Error('Synthesize after tag select did not return goal_suggestion');
    }

    // Preserve prior tags on refine if model omitted them (not on fresh tag-select synthesize)
    if (
      turnKind === 'refine' &&
      structured.type === 'goal_suggestion' &&
      (!structured.suggestedTags || structured.suggestedTags.length === 0) &&
      state.suggestedTags.length > 0
    ) {
      return {
        structuredResponse: {
          ...structured,
          suggestedTags: state.suggestedTags,
        },
      };
    }

    // Normalize tag-confirm clarification to selecting-tags flow
    if (turnKind === 'tag_confirm' && structured.type === 'clarification') {
      return {
        structuredResponse: {
          ...structured,
          multiSelect: true,
          flowState: 'selecting-tags' as const,
        },
      };
    }

    return { structuredResponse: structured };
  } catch {
    if (state.parseAttempt < 1) {
      return { parseAttempt: state.parseAttempt + 1 };
    }
    throw new Error('Failed to parse roadmap creation response');
  }
}

async function retryLlm(state: typeof RoadmapCreationState.State) {
  const messages = buildLlmMessages(state, true);
  const turnKind = resolveTurnKind(state);

  if (turnKind === 'tag_confirm' || turnKind === 'synthesize') {
    try {
      const response = await invokeChatModelWithTools(messages, hobbyCatalogTools);
      return { rawContent: messageContentToString(response.content) };
    } catch {
      // fall through
    }
  }

  const response = await invokeChatModel(messages);
  return { rawContent: messageContentToString(response.content) };
}

async function finalizeResponse(state: typeof RoadmapCreationState.State) {
  const structured = state.structuredResponse;
  if (!structured) {
    throw new Error('Missing structured response');
  }

  let nextFlowState: RoadmapCreationFlowState = state.flowState;
  let clarificationRound = state.clarificationRound;
  let nextTags = state.suggestedTags;

  if (structured.type === 'clarification') {
    nextFlowState =
      structured.flowState === 'selecting-tags' ? 'selecting-tags' : 'clarifying';
    clarificationRound = state.clarificationRound + 1;
  } else if (structured.type === 'lesson_plan') {
    nextFlowState = 'reviewing-outline';
  } else {
    nextFlowState = 'confirming-goal';
    nextTags = structured.suggestedTags ?? [];
  }

  const assistantText =
    structured.type === 'lesson_plan'
      ? structured.message ?? `Here's your outline for ${structured.courseTitle}.`
      : structured.message;

  return {
    flowState: nextFlowState,
    clarificationRound,
    suggestedTags: nextTags,
    conversationMessages: [new AIMessage(assistantText)],
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
    intent: input.intent ?? 'chat',
    roadmapName: input.roadmapName,
    roadmapGoal: input.roadmapGoal,
    roadmapBackground: input.roadmapBackground,
    suggestedTags: input.suggestedTags ?? [],
    currentLessonPlan: input.currentLessonPlan ?? null,
    structuredResponse: null,
    parseAttempt: 0,
    rawContent: '',
  };
}
