import { traceable } from 'langsmith/traceable';
import type { RoadmapCreationChatRequest } from '../../schemas/roadmapCreationChat.schema';
import { createChildLogger } from '../../lib/logger';
import {
  countClarificationRounds,
  createRoadmapCreationGraph,
  initialStateFromRequest,
  type RoadmapCreationGraphInput,
} from './graphs/roadmapCreationGraph';

const log = createChildLogger({ module: 'roadmap-creation' });

export class RoadmapCreationUnavailableError extends Error {
  constructor(message = 'Roadmap creation chat is temporarily unavailable. Please try again.') {
    super(message);
    this.name = 'RoadmapCreationUnavailableError';
  }
}

export type RoadmapCreationTraceConfig = {
  userId: string;
};

const FALLBACK_CLARIFICATION = {
  type: 'clarification' as const,
  message: 'What is your current experience level with this hobby?',
  quickReplies: [
    { text: 'Complete beginner' },
    { text: 'Some basics' },
    { text: 'Intermediate' },
    { text: 'Advanced' },
  ],
  multiSelect: false,
  flowState: 'clarifying' as const,
};

async function invokeGraphInner(
  input: RoadmapCreationGraphInput,
  config: RoadmapCreationTraceConfig,
) {
  const graph = createRoadmapCreationGraph();
  const result = await graph.invoke(initialStateFromRequest(input), {
    runName: `roadmap-creation:${input.flowState}`,
    tags: ['roadmap-creation', input.flowState],
    metadata: {
      userId: config.userId,
      conversationId: input.conversationId,
      isFirstRoadmap: input.isFirstRoadmap,
      clarificationRound: countClarificationRounds(input.messages),
      userRoles: input.userRoles,
    },
  });

  if (!result.structuredResponse) {
    throw new RoadmapCreationUnavailableError();
  }

  log.info(
    {
      userId: config.userId,
      responseType: result.structuredResponse.type,
      flowState: result.flowState,
      clarificationRound: result.clarificationRound,
    },
    'Roadmap creation turn completed',
  );

  return {
    ...result.structuredResponse,
    flowState:
      result.structuredResponse.type === 'goal_suggestion'
        ? ('confirming-goal' as const)
        : result.structuredResponse.flowState,
  };
}

export const invokeRoadmapCreationChat = traceable(invokeGraphInner, {
  name: 'roadmap-creation-chat',
  run_type: 'chain',
});

export async function invokeRoadmapCreationChatSafe(
  input: RoadmapCreationChatRequest & { learnerContextSummary?: string },
  config: RoadmapCreationTraceConfig,
) {
  try {
    return await invokeRoadmapCreationChat(input, config);
  } catch (error) {
    log.error({ err: error, userId: config.userId }, 'Roadmap creation chat failed');

    if (input.flowState === 'confirming-goal') {
      throw new RoadmapCreationUnavailableError();
    }

    return {
      ...FALLBACK_CLARIFICATION,
      flowState: 'clarifying' as const,
    };
  }
}
