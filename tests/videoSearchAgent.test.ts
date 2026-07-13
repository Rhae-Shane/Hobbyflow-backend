import { parseVideoJudgeDecision, runVideoSearchAgent } from '../src/services/lesson/videoSearchAgent';

jest.mock('../src/services/langgraph/llm', () => ({
  invokeChatModel: jest.fn(),
}));

jest.mock('../src/services/lesson/youtubeCandidates', () => {
  const actual = jest.requireActual('../src/services/lesson/youtubeCandidates');
  return {
    ...actual,
    searchYouTubeCandidates: jest.fn(),
  };
});

import { invokeChatModel } from '../src/services/langgraph/llm';
import { searchYouTubeCandidates } from '../src/services/lesson/youtubeCandidates';

const mockInvoke = invokeChatModel as jest.MockedFunction<typeof invokeChatModel>;
const mockSearch = searchYouTubeCandidates as jest.MockedFunction<typeof searchYouTubeCandidates>;

describe('parseVideoJudgeDecision', () => {
  it('parses select decisions', () => {
    expect(parseVideoJudgeDecision('{"decision":"select","videoId":"oI_EnzY4jvY"}')).toEqual({
      decision: 'select',
      videoId: 'oI_EnzY4jvY',
    });
  });

  it('parses reject with nextQuery', () => {
    expect(
      parseVideoJudgeDecision(
        '{"decision":"reject","reason":"off topic python","nextQuery":"Drums keeping time beginner"}',
      ),
    ).toEqual({
      decision: 'reject',
      reason: 'off topic python',
      nextQuery: 'Drums keeping time beginner',
    });
  });

  it('returns null for invalid payloads', () => {
    expect(parseVideoJudgeDecision('not json')).toBeNull();
    expect(parseVideoJudgeDecision('{"decision":"select"}')).toBeNull();
    expect(parseVideoJudgeDecision('{"decision":"reject","reason":"x"}')).toBeNull();
  });
});

describe('runVideoSearchAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects an on-topic video on attempt 1', async () => {
    mockSearch.mockResolvedValueOnce([
      {
        videoId: 'abcABC12345',
        title: 'Drums Keeping Time Beginner',
        description: 'Learn the pulse on drums',
        channelTitle: 'Drum School',
      },
      {
        videoId: 'pythonXXXXX',
        title: 'Learn Python in 12 Hours',
        description: 'coding tutorial',
        channelTitle: 'freeCodeCamp',
      },
    ]);
    mockInvoke.mockResolvedValueOnce({
      content: '{"decision":"select","videoId":"abcABC12345"}',
    } as never);

    const asset = await runVideoSearchAgent({
      initialQuery: 'keeping time tutorial',
      kind: 'video',
      hobby: 'Drums',
      lessonName: 'Keeping Time',
    });

    expect(asset).not.toBeNull();
    expect(asset!.source.externalId).toBe('abcABC12345');
    expect(asset!.title).toBe('Drums Keeping Time Beginner');
    expect(asset!.source.searchQuery).toContain('Drums');
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('rejects off-topic then selects after refined query', async () => {
    mockSearch
      .mockResolvedValueOnce([
        {
          videoId: 'pythonXXXXX',
          title: 'Learn Python Programming',
          description: 'CS intro',
          channelTitle: 'Code',
        },
      ])
      .mockResolvedValueOnce([
        {
          videoId: 'drumsYYYYYYY',
          title: 'Beginner Drum Beat Tutorial',
          description: 'keeping time on the kit',
          channelTitle: 'Drummers',
        },
      ]);

    mockInvoke
      .mockResolvedValueOnce({
        content:
          '{"decision":"reject","reason":"python programming","nextQuery":"Drums beginner beat keeping time tutorial"}',
      } as never)
      .mockResolvedValueOnce({
        content: '{"decision":"select","videoId":"drumsYYYYYYY"}',
      } as never);

    const asset = await runVideoSearchAgent({
      initialQuery: 'beat tutorial',
      kind: 'video',
      hobby: 'Drums',
      lessonName: 'Keeping Time',
    });

    expect(asset).not.toBeNull();
    expect(asset!.source.externalId).toBe('drumsYYYYYYY');
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch.mock.calls[1]![0]).toMatch(/Drums/i);
  });

  it('ignores select ids that are not in candidates and retries', async () => {
    mockSearch
      .mockResolvedValueOnce([
        {
          videoId: 'realIdXXXX1',
          title: 'Drums lesson',
          description: 'drums',
          channelTitle: 'D',
        },
      ])
      .mockResolvedValueOnce([
        {
          videoId: 'realIdXXXX2',
          title: 'Drums lesson 2',
          description: 'drums',
          channelTitle: 'D',
        },
      ]);

    mockInvoke
      .mockResolvedValueOnce({
        content: '{"decision":"select","videoId":"notInListXXX"}',
      } as never)
      .mockResolvedValueOnce({
        content: '{"decision":"select","videoId":"realIdXXXX2"}',
      } as never);

    const asset = await runVideoSearchAgent({
      initialQuery: 'drums',
      kind: 'video',
      hobby: 'Drums',
      lessonName: 'Keeping Time',
      maxAttempts: 2,
    });

    expect(asset!.source.externalId).toBe('realIdXXXX2');
  });

  it('returns null after all attempts reject', async () => {
    mockSearch.mockResolvedValue([
      {
        videoId: 'pythonXXXXX',
        title: 'Python Crash Course',
        description: 'programming',
        channelTitle: 'Code',
      },
    ]);
    mockInvoke.mockResolvedValue({
      content:
        '{"decision":"reject","reason":"off topic","nextQuery":"Drums keeping time beginner tutorial"}',
    } as never);

    const asset = await runVideoSearchAgent({
      initialQuery: 'tutorial',
      kind: 'video',
      hobby: 'Drums',
      lessonName: 'Keeping Time',
      maxAttempts: 3,
    });

    expect(asset).toBeNull();
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });
});
