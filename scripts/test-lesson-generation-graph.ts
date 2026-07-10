/**
 * Smoke script for lesson generation graph (mocked media, live LLM if keys present).
 * Run: npm run test:lesson-generation
 */
import {
  createLessonGenerationGraph,
  initialStateFromInput,
} from '../src/services/langgraph/graphs/lessonGenerationGraph';
import {
  assertNoSearchUrlsInContent,
  sanitizeLessonContentForClient,
} from '../src/schemas/lessonContent.schema';

async function main() {
  const graph = createLessonGenerationGraph();
  const result = await graph.invoke(
    initialStateFromInput({
      userId: 'script-user',
      roadmapId: 'script-roadmap',
      lessonId: 'script-lesson',
      nodeId: 'script-node',
      hobby: 'Drums',
      sessionConfig: {
        name: 'Keeping Time',
        hook: 'Can you find the pulse in your favorite song?',
        meaning: 'The beat is the heartbeat of every track you love.',
      },
      personalize: {
        learningGoal: 'Master basic rhythm',
        backgroundLevel: 'Complete beginner',
      },
      roadmapTitle: 'Drumming Foundations for Beginners',
      allowVideo: true,
      allowAudio: true,
      allowImages: true,
      requestGroupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      startedAtMs: Date.now(),
    }),
  );

  if (result.error || !result.content) {
    console.error('FAILED', result.error);
    process.exit(1);
  }

  assertNoSearchUrlsInContent(result.content);
  const publicContent = sanitizeLessonContentForClient(result.content);
  const blob = JSON.stringify(publicContent);
  if (blob.includes('search_query') || blob.includes('searchQuery')) {
    console.error('FAILED: client content leaked search query');
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        pages: publicContent.pages.length,
        media: publicContent.media.map((m) => ({
          kind: m.kind,
          url: m.url.slice(0, 80),
          externalId: m.source.externalId,
        })),
        headings: publicContent.pages.map((p) => p.heading),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
