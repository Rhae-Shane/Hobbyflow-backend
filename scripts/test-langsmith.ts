import 'dotenv/config';
import { HumanMessage } from '@langchain/core/messages';
import { logger } from '../src/lib/logger';
import { invokeChatModel } from '../src/services/langgraph/llm';

async function main() {
  logger.info(
    {
      langsmithTracing: process.env.LANGSMITH_TRACING,
      langsmithProject: process.env.LANGSMITH_PROJECT,
      langsmithEndpoint: process.env.LANGSMITH_ENDPOINT,
    },
    'Running LangSmith trace test',
  );

  const response = await invokeChatModel([
    new HumanMessage('Reply with exactly: HobbyFlow trace test OK'),
  ]);

  const content = typeof response.content === 'string' ? response.content : String(response.content);

  logger.info({ content }, 'LLM response received — check LangSmith for the trace');
}

main().catch((error) => {
  logger.error({ err: error }, 'LangSmith trace test failed');
  process.exit(1);
});
