import 'dotenv/config';
import { logger } from '../src/lib/logger';
import { invokeRoadmapCreationChatSafe } from '../src/services/langgraph/roadmapCreationChatService';
import type { RoadmapCreationChatRequest } from '../src/schemas/roadmapCreationChat.schema';

type Turn = { user: string; flowState: RoadmapCreationChatRequest['flowState'] };

const SCRIPTED_TURNS: Turn[] = [
  { user: 'i want to learn guitar', flowState: 'collecting-input' },
  { user: 'Complete beginner (never held one)', flowState: 'clarifying' },
  { user: '- Write my own music', flowState: 'clarifying' },
  { user: '- Rock or Indie', flowState: 'clarifying' },
  {
    user: '- Record songs at home\n- Share music on social media\ni want to be better play better',
    flowState: 'clarifying',
  },
];

async function main() {
  logger.info(
    {
      langsmithTracing: process.env.LANGSMITH_TRACING,
      langsmithProject: process.env.LANGSMITH_PROJECT,
    },
    'Running roadmap creation graph script',
  );

  const messages: RoadmapCreationChatRequest['messages'] = [];
  let flowState: RoadmapCreationChatRequest['flowState'] = 'collecting-input';
  let lastResponse = null;

  for (const turn of SCRIPTED_TURNS) {
    messages.push({ role: 'user', content: turn.user });

    lastResponse = await invokeRoadmapCreationChatSafe(
      {
        message: turn.user,
        messages: [...messages],
        flowState: turn.flowState,
        userRoles: ['Student', 'Developer/Engineer'],
        isFirstRoadmap: true,
      },
      { userId: 'script-test-user' },
    );

    messages.push({ role: 'assistant', content: lastResponse.message });
    flowState = lastResponse.flowState;

    logger.info(
      { type: lastResponse.type, flowState: lastResponse.flowState },
      'Turn completed',
    );

    if (lastResponse.type === 'goal_suggestion') {
      break;
    }
  }

  if (!lastResponse || lastResponse.type !== 'goal_suggestion') {
    throw new Error(`Expected goal_suggestion, got ${lastResponse?.type ?? 'none'}`);
  }

  if (!/guitar/i.test(lastResponse.suggestedHobby)) {
    throw new Error(`Expected Guitar hobby, got ${lastResponse.suggestedHobby}`);
  }

  logger.info(
    {
      suggestedHobby: lastResponse.suggestedHobby,
      suggestedName: lastResponse.suggestedName,
      flowState,
    },
    'Roadmap creation script OK — check LangSmith for trace tagged roadmap-creation',
  );
}

main().catch((error) => {
  logger.error({ err: error }, 'Roadmap creation script failed');
  process.exit(1);
});
