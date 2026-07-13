import { env } from '../config/env';

const planLevelEnum = ['beginner', 'intermediate', 'advanced'];
const timeBudgetEnum = ['15 min/day', '30 min/day', '1 hr/day'];
const modalityEnum = ['video', 'article', 'audio', 'interactive'];
const techniqueStatusEnum = ['todo', 'in_progress', 'mastered', 'skipped'];
const chatRoleEnum = ['user', 'assistant', 'system'];
const roadmapCreationFlowStateEnum = [
  'collecting-input',
  'clarifying',
  'selecting-tags',
  'confirming-goal',
  'reviewing-outline',
];
const lessonMediaKindEnum = ['image', 'video', 'audio'];
const mediaProviderEnum = ['google_images', 'wikimedia', 'youtube', 'llm_svg', 'upload', 'curated'];

const techniqueSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 't1' },
    name: { type: 'string', example: 'Rule of thirds' },
    why: { type: 'string', example: 'Improves visual composition quickly.' },
    order: { type: 'integer', minimum: 1, example: 1 },
    modality: { type: 'string', enum: modalityEnum, example: 'video' },
    estimatedMinutes: { type: 'integer', minimum: 1, example: 25 },
    searchQuery: { type: 'string', example: 'rule of thirds photography tutorial' },
    status: { type: 'string', enum: techniqueStatusEnum, example: 'todo' },
  },
};

const errorSchema = (example: { error: string; code: string; field?: string }) => ({
  type: 'object',
  properties: {
    error: { type: 'string', example: example.error },
    code: { type: 'string', example: example.code },
    ...(example.field ? { field: { type: 'string', example: example.field } } : {}),
    requestId: { type: 'string', example: 'req_abc123' },
  },
});

const unauthorizedResponse = {
  description: 'Unauthorized',
  content: {
    'application/json': {
      schema: errorSchema({
        error: 'Please sign in to continue',
        code: 'AUTH_MISSING_HEADER',
      }),
    },
  },
};

const rateLimitedResponse = {
  description: 'Rate limit exceeded',
  content: {
    'application/json': {
      schema: errorSchema({
        error: 'Too many requests. Please wait a few minutes and try again.',
        code: 'RATE_LIMITED',
      }),
    },
  },
};

const validationErrorResponse = {
  description: 'Validation error',
  content: {
    'application/json': {
      schema: errorSchema({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
      }),
    },
  },
};

const internalErrorResponse = {
  description: 'Internal server error',
  content: {
    'application/json': {
      schema: errorSchema({
        error: 'Something went wrong. Please try again.',
        code: 'INTERNAL_ERROR',
      }),
    },
  },
};

const appUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: '8ccf24c4-733f-4f6d-b0cd-0d230ac5bf40' },
    email: { type: 'string', nullable: true, example: 'rhaeshane@gmail.com' },
    fullName: { type: 'string', nullable: true, example: 'Rhae Shane' },
    avatarUrl: {
      type: 'string',
      nullable: true,
      example: 'https://lh3.googleusercontent.com/a/example=s96-c',
    },
    provider: { type: 'string', nullable: true, example: 'google' },
    emailVerified: { type: 'boolean', example: true },
    createdAt: { type: 'string', nullable: true, example: '2026-07-09T12:04:32.565736Z' },
    lastSignInAt: { type: 'string', nullable: true, example: '2026-07-09T12:04:34.255402Z' },
  },
};

const chatMessageSchema = {
  type: 'object',
  required: ['role', 'content'],
  properties: {
    role: { type: 'string', enum: chatRoleEnum, example: 'user' },
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 8000,
      example: 'How do I improve my portrait lighting?',
    },
  },
};

const quickReplySchema = {
  type: 'object',
  required: ['text'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 200, example: 'Complete beginner' },
  },
};

const lessonPlanLessonSchema = {
  type: 'object',
  required: ['name', 'hook', 'meaning'],
  properties: {
    name: { type: 'string', example: 'Rule of thirds' },
    hook: { type: 'string', example: 'Why your photos feel off-center' },
    meaning: { type: 'string', example: 'Place subjects on grid intersections for balance.' },
  },
};

const lessonPlanSectionSchema = {
  type: 'object',
  required: ['name', 'lessons'],
  properties: {
    name: { type: 'string', example: 'Composition basics' },
    lessons: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: lessonPlanLessonSchema,
    },
  },
};

const currentLessonPlanSchema = {
  type: 'object',
  required: ['courseTitle', 'sections'],
  properties: {
    courseTitle: { type: 'string', example: 'Portrait Photography Foundations' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: lessonPlanSectionSchema,
    },
    stage: { type: 'string', enum: ['outline'], example: 'outline' },
    lessonPlanId: { type: 'string', format: 'uuid' },
    message: { type: 'string' },
  },
};

const goalCardSchema = {
  type: 'object',
  required: [
    'suggestedHobby',
    'suggestedName',
    'suggestedGoal',
    'suggestedBackground',
    'suggestedLevel',
  ],
  properties: {
    suggestedHobby: { type: 'string', example: 'Photography' },
    suggestedName: { type: 'string', example: 'Portrait Photography Foundations' },
    suggestedGoal: { type: 'string', example: 'Take better portrait photos' },
    suggestedBackground: { type: 'string', example: 'Phone camera hobbyist' },
    suggestedLevel: { type: 'string', enum: planLevelEnum, example: 'beginner' },
  },
};

const materializeLessonPlanSchema = {
  type: 'object',
  required: ['courseTitle', 'sections', 'stage', 'lessonPlanId'],
  properties: {
    courseTitle: { type: 'string', example: 'Portrait Photography Foundations' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: lessonPlanSectionSchema,
    },
    stage: { type: 'string', enum: ['outline'], example: 'outline' },
    lessonPlanId: { type: 'string', format: 'uuid' },
  },
};

const clarificationResponseSchema = {
  type: 'object',
  required: ['type', 'message', 'quickReplies', 'multiSelect', 'flowState'],
  properties: {
    type: { type: 'string', enum: ['clarification'] },
    message: { type: 'string', example: 'What is your current experience level?' },
    quickReplies: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: quickReplySchema,
    },
    multiSelect: { type: 'boolean', example: false },
    flowState: {
      type: 'string',
      enum: ['collecting-input', 'clarifying', 'selecting-tags'],
      example: 'clarifying',
    },
  },
};

const goalSuggestionResponseSchema = {
  type: 'object',
  required: [
    'type',
    'message',
    'suggestedHobby',
    'suggestedName',
    'suggestedGoal',
    'suggestedBackground',
    'flowState',
  ],
  properties: {
    type: { type: 'string', enum: ['goal_suggestion'] },
    message: { type: 'string', example: 'Here is a goal based on what you shared.' },
    suggestedHobby: { type: 'string', example: 'Photography' },
    suggestedName: { type: 'string', example: 'Portrait Photography Foundations' },
    suggestedGoal: { type: 'string', example: 'Take better portrait photos' },
    suggestedBackground: { type: 'string', example: 'Phone camera hobbyist' },
    suggestedLevel: { type: 'string', enum: planLevelEnum, example: 'beginner' },
    flowState: { type: 'string', enum: ['confirming-goal'] },
  },
};

const lessonPlanResponseSchema = {
  type: 'object',
  required: ['type', 'courseTitle', 'sections', 'stage', 'lessonPlanId', 'flowState'],
  properties: {
    type: { type: 'string', enum: ['lesson_plan'] },
    courseTitle: { type: 'string', example: 'Portrait Photography Foundations' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: lessonPlanSectionSchema,
    },
    stage: { type: 'string', enum: ['outline'] },
    lessonPlanId: { type: 'string', format: 'uuid' },
    message: { type: 'string' },
    flowState: { type: 'string', enum: ['reviewing-outline'] },
  },
};

const mindMapNodeSchema = {
  type: 'object',
  required: ['id', 'label', 'lessonNodeIds', 'children'],
  properties: {
    id: { type: 'string', example: 'root' },
    label: { type: 'string', example: 'Portrait Photography' },
    lessonNodeIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
    },
    colorIndex: { type: 'integer', minimum: 0, maximum: 8 },
    children: {
      type: 'array',
      items: { $ref: '#/components/schemas/MindMapNode' },
    },
  },
};

const mindMapMetadataSchema = {
  type: 'object',
  properties: {
    version: { type: 'string', example: '1' },
    createdAt: { type: 'string', format: 'date-time' },
    language: { type: 'string', example: 'en' },
    roadmapId: { type: 'string', format: 'uuid' },
    roadmapTitle: { type: 'string', example: 'Portrait Photography Foundations' },
    lessonCount: { type: 'integer', minimum: 0 },
    sectionCount: { type: 'integer', minimum: 0 },
    practiceCount: { type: 'integer', minimum: 0 },
    knowledgeCardCount: { type: 'integer', minimum: 0 },
    sourceFingerprint: { type: 'string' },
    personalizationEnabled: { type: 'boolean' },
  },
};

const roadmapMindMapSchema = {
  type: 'object',
  required: ['title', 'root', 'metadata'],
  properties: {
    title: { type: 'string', example: 'Portrait Photography Foundations' },
    root: { $ref: '#/components/schemas/MindMapNode' },
    metadata: mindMapMetadataSchema,
  },
};

const generateLessonResponseSchema = {
  type: 'object',
  required: ['status', 'lessonId'],
  properties: {
    status: {
      type: 'string',
      enum: ['success', 'generating', 'failed'],
      example: 'success',
    },
    message: { type: 'string' },
    lessonId: { type: 'string', format: 'uuid' },
    nodeId: { type: 'string', format: 'uuid' },
    requestGroupId: { type: 'string', format: 'uuid' },
    generationDurationMs: { type: 'number' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Express API for HobbyFlow',
    version: '1.0.0',
    description: 'REST API built with Express.js for AI-assisted hobby learning plans.',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'HobbyFlow API server',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Plans' },
    { name: 'Chat' },
    { name: 'Roadmap Creation' },
    { name: 'Roadmaps' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns service availability plus the deployed git short SHA when set by CI.',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'hobbyflow-server' },
                    gitSha: { type: 'string', nullable: true, example: 'b15844c' },
                    deployedAt: { type: 'string', nullable: true, example: '2026-07-12T11:03:00Z' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/version': {
      get: {
        tags: ['Health'],
        summary: 'Deployed version',
        description: 'Returns the git commit currently running on this server after a CI deploy.',
        responses: {
          200: {
            description: 'Deploy metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service: { type: 'string', example: 'hobbyflow-server' },
                    gitSha: { type: 'string', nullable: true },
                    gitShort: { type: 'string', nullable: true },
                    deployedAt: { type: 'string', nullable: true },
                    nodeEnv: { type: 'string', example: 'production' },
                    pid: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['Health'],
        summary: 'OpenAPI document',
        description: 'Returns this OpenAPI specification as JSON.',
        responses: {
          200: {
            description: 'OpenAPI 3.0 document',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/token': {
      post: {
        tags: ['Authentication'],
        summary: 'Get access token',
        description:
          'Sign in with email and password to get a Supabase JWT for testing protected endpoints in the API docs.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'omesh@gmail.com',
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    example: 'test@123',
                  },
                },
              },
              example: {
                email: 'omesh@gmail.com',
                password: 'test@123',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Access token issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    refreshToken: { type: 'string', example: 'v1.MRj...' },
                    expiresIn: { type: 'integer', example: 3600 },
                    userId: { type: 'string', example: '33277cf6-c13a-46bb-892b-aa15d643144b' },
                    email: { type: 'string', example: 'omesh@gmail.com' },
                    user: appUserSchema,
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'A valid email is required',
                  code: 'VALIDATION_ERROR',
                  field: 'email',
                }),
              },
            },
          },
          401: {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Invalid email or password',
                  code: 'AUTH_INVALID_CREDENTIALS',
                }),
              },
            },
          },
          503: {
            description: 'Auth service unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Sign-in service is not configured on this server.',
                  code: 'AUTH_SERVICE_UNAVAILABLE',
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/plans': {
      post: {
        tags: ['Plans'],
        summary: 'Generate a learning plan',
        description:
          'Creates a personalized technique roadmap for a hobby. Requires a valid Supabase JWT in the Authorization header.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['hobby', 'level', 'timeBudget'],
                properties: {
                  hobby: {
                    type: 'string',
                    minLength: 1,
                    description: 'Hobby or skill to learn',
                    example: 'Photography',
                  },
                  level: {
                    type: 'string',
                    enum: planLevelEnum,
                    example: 'beginner',
                  },
                  goal: {
                    type: 'string',
                    description: 'Optional learning goal',
                    example: 'Take better portrait photos',
                  },
                  timeBudget: {
                    type: 'string',
                    enum: timeBudgetEnum,
                    example: '30 min/day',
                  },
                },
              },
              example: {
                hobby: 'Photography',
                level: 'beginner',
                goal: 'Take better portrait photos',
                timeBudget: '30 min/day',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Plan generated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    planId: { type: 'string', example: 'plan_abc123' },
                    hobby: { type: 'string', example: 'Photography' },
                    goal: { type: 'string', example: 'Take better portrait photos' },
                    level: { type: 'string', enum: planLevelEnum, example: 'beginner' },
                    estimatedDuration: { type: 'string', example: '4 weeks' },
                    generatedAt: {
                      type: 'string',
                      format: 'date-time',
                      example: '2026-07-09T09:00:00.000Z',
                    },
                    techniques: {
                      type: 'array',
                      items: techniqueSchema,
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Hobby is required',
                  code: 'VALIDATION_ERROR',
                  field: 'hobby',
                }),
              },
            },
          },
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          503: {
            description: 'Planner unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error:
                    'Plan generation is temporarily unavailable for this hobby. Try again or use a starter plan.',
                  code: 'PLANNER_UNAVAILABLE',
                }),
              },
            },
          },
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/plans/replace': {
      post: {
        tags: ['Plans'],
        summary: 'Replace a technique',
        description:
          'Suggests an alternative technique for a given slot in the current plan. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['techniqueId', 'hobby', 'level', 'remainingTechniques'],
                properties: {
                  techniqueId: {
                    type: 'string',
                    description: 'Technique slot id (e.g. t1, t2)',
                    example: 't3',
                  },
                  hobby: { type: 'string', minLength: 1, example: 'Photography' },
                  level: { type: 'string', enum: planLevelEnum, example: 'beginner' },
                  goal: { type: 'string', example: 'Take better portrait photos' },
                  remainingTechniques: {
                    type: 'array',
                    minItems: 1,
                    description: 'Names of techniques still in the plan (used to avoid duplicates)',
                    items: { type: 'string', minLength: 1 },
                    example: ['Rule of thirds', 'Portrait lighting basics'],
                  },
                },
              },
              example: {
                techniqueId: 't3',
                hobby: 'Photography',
                level: 'beginner',
                goal: 'Take better portrait photos',
                remainingTechniques: ['Rule of thirds', 'Portrait lighting basics'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Technique replaced successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    technique: techniqueSchema,
                  },
                },
              },
            },
          },
          400: {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Invalid technique selected',
                  code: 'INVALID_TECHNIQUE_ID',
                }),
              },
            },
          },
          401: unauthorizedResponse,
          409: {
            description: 'No unique replacement available',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: "Couldn't find a unique replacement — keep your current technique",
                  code: 'DUPLICATE_TECHNIQUE',
                }),
              },
            },
          },
          429: rateLimitedResponse,
          503: {
            description: 'Planner unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: "Couldn't find a replacement right now. Please try again.",
                  code: 'PLANNER_UNAVAILABLE',
                }),
              },
            },
          },
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Send a chat message',
        description:
          'Invokes the hobby learning chat agent and returns a single assistant reply. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                properties: {
                  messages: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 50,
                    items: chatMessageSchema,
                  },
                  hobby: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 100,
                    example: 'Photography',
                  },
                },
              },
              example: {
                hobby: 'Photography',
                messages: [
                  { role: 'user', content: 'How do I improve my portrait lighting?' },
                ],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Assistant reply',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: chatMessageSchema,
                  },
                },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          503: {
            description: 'Chat unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Chat is temporarily unavailable. Please try again.',
                  code: 'CHAT_UNAVAILABLE',
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/chat/stream': {
      post: {
        tags: ['Chat'],
        summary: 'Stream a chat reply',
        description:
          'Streams assistant tokens as Server-Sent Events (`text/event-stream`). Events are JSON payloads with `type: token | done | error`. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                properties: {
                  messages: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 50,
                    items: chatMessageSchema,
                  },
                  hobby: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 100,
                    example: 'Photography',
                  },
                },
              },
              example: {
                hobby: 'Photography',
                messages: [
                  { role: 'user', content: 'Explain aperture in simple terms.' },
                ],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'SSE stream of chat tokens',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  example:
                    'data: {"type":"token","content":"Aperture"}\n\ndata: {"type":"done"}\n\n',
                },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          503: {
            description: 'Chat unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Chat is temporarily unavailable. Please try again.',
                  code: 'CHAT_UNAVAILABLE',
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/roadmap-creation-chat': {
      post: {
        tags: ['Roadmap Creation'],
        summary: 'Roadmap creation chat turn',
        description:
          'Runs one turn of the guided roadmap-creation flow. Returns a clarification, goal suggestion, or lesson-plan outline. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'messages', 'flowState', 'isFirstRoadmap'],
                properties: {
                  message: { type: 'string', example: 'I want to learn photography' },
                  messages: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                  flowState: {
                    type: 'string',
                    enum: roadmapCreationFlowStateEnum,
                    example: 'collecting-input',
                  },
                  userRoles: {
                    type: 'array',
                    items: { type: 'string' },
                    default: [],
                    example: ['student'],
                  },
                  isFirstRoadmap: { type: 'boolean', example: true },
                  intent: {
                    type: 'string',
                    enum: ['chat', 'generate_outline'],
                    default: 'chat',
                  },
                  learnerContextSummary: {
                    type: 'string',
                    maxLength: 8000,
                    description: 'Plain-text prefs for personalization',
                  },
                  currentLessonPlan: currentLessonPlanSchema,
                  roadmapName: { type: 'string' },
                  roadmapGoal: { type: 'string' },
                  roadmapBackground: { type: 'string' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
              example: {
                message: 'I want to learn photography',
                messages: [{ role: 'user', content: 'I want to learn photography' }],
                flowState: 'collecting-input',
                userRoles: [],
                isFirstRoadmap: true,
                intent: 'chat',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Structured roadmap-creation response',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    clarificationResponseSchema,
                    goalSuggestionResponseSchema,
                    lessonPlanResponseSchema,
                  ],
                },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          503: {
            description: 'Roadmap creation chat unavailable',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap creation chat is temporarily unavailable. Please try again.',
                  code: 'CHAT_UNAVAILABLE',
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/roadmaps/materialize': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Materialize a roadmap',
        description:
          'Persists a confirmed goal card and lesson-plan outline as a preview roadmap with sections and lessons. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['hobby', 'level', 'goalCard', 'lessonPlan'],
                properties: {
                  hobby: { type: 'string', minLength: 1, maxLength: 120, example: 'Photography' },
                  level: { type: 'string', enum: planLevelEnum, example: 'beginner' },
                  goalCard: goalCardSchema,
                  lessonPlan: materializeLessonPlanSchema,
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                    default: [],
                  },
                  userRoles: {
                    type: 'array',
                    items: { type: 'string' },
                    default: [],
                  },
                  conversationId: { type: 'string', format: 'uuid' },
                  learnerContextSummary: { type: 'string', maxLength: 8000 },
                  isFirstRoadmap: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Roadmap created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'roadmapId',
                    'hobbyId',
                    'title',
                    'intro',
                    'coverImageUrl',
                    'sections',
                    'lessonCount',
                  ],
                  properties: {
                    roadmapId: { type: 'string', format: 'uuid' },
                    hobbyId: { type: 'string', format: 'uuid' },
                    title: { type: 'string', example: 'Portrait Photography Foundations' },
                    intro: {
                      type: 'object',
                      properties: {
                        intro: { type: 'string' },
                        achievements: { type: 'string' },
                      },
                    },
                    coverImageUrl: { type: 'string', nullable: true },
                    sections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          lessonCount: { type: 'integer', minimum: 0 },
                        },
                      },
                    },
                    lessonCount: { type: 'integer', minimum: 0 },
                  },
                },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}': {
      get: {
        tags: ['Roadmaps'],
        summary: 'Get roadmap detail',
        description:
          'Returns a roadmap with its nodes and ordered lessons. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Roadmap id',
          },
        ],
        responses: {
          200: {
            description: 'Roadmap detail',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    roadmap: {
                      type: 'object',
                      description: 'Roadmap row from the database',
                      additionalProperties: true,
                    },
                    nodes: {
                      type: 'array',
                      description: 'Roadmap nodes (sections and lessons); lesson content is sanitized for clients',
                      items: { type: 'object', additionalProperties: true },
                    },
                    lessons: {
                      type: 'array',
                      description: 'Ordered learning-path lesson rows',
                      items: { type: 'object', additionalProperties: true },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Missing roadmap id',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap id is required',
                  code: 'VALIDATION_ERROR',
                }),
              },
            },
          },
          401: unauthorizedResponse,
          404: {
            description: 'Roadmap not found',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap not found',
                  code: 'NOT_FOUND',
                }),
              },
            },
          },
          429: rateLimitedResponse,
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}/activate': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Activate a roadmap',
        description:
          'Sets the roadmap status to `active`. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Roadmap id',
          },
        ],
        responses: {
          200: {
            description: 'Roadmap activated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    hobby_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string', example: 'active' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Missing roadmap id',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap id is required',
                  code: 'VALIDATION_ERROR',
                }),
              },
            },
          },
          401: unauthorizedResponse,
          404: {
            description: 'Roadmap not found',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap not found',
                  code: 'NOT_FOUND',
                }),
              },
            },
          },
          429: rateLimitedResponse,
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}/mindmap': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Build or get mind map',
        description:
          'Returns a cached mind map (200) or builds a deterministic roadmap → section → lesson tree (201). Pass `force: true` to rebuild. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Roadmap id',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  force: {
                    type: 'boolean',
                    description: 'Regenerate even if a cached mind map exists',
                    example: false,
                  },
                },
              },
              example: { force: false },
            },
          },
        },
        responses: {
          200: {
            description: 'Cached mind map',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mindMap: roadmapMindMapSchema,
                  },
                },
              },
            },
          },
          201: {
            description: 'Newly generated mind map',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mindMap: roadmapMindMapSchema,
                  },
                },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          404: {
            description: 'Roadmap not found',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap not found',
                  code: 'NOT_FOUND',
                }),
              },
            },
          },
          429: rateLimitedResponse,
          500: internalErrorResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}/lessons/{lessonId}/generate': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Generate lesson content',
        description:
          'Generates rich lesson content for a roadmap lesson. Returns 409 while another generation is in progress, or 500 if generation failed. Requires a valid Supabase JWT.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Roadmap id',
          },
          {
            name: 'lessonId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Lesson (roadmap_lessons) id',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  force: {
                    type: 'boolean',
                    default: false,
                    description: 'Regenerate even if content already exists',
                  },
                },
              },
              example: { force: false },
            },
          },
        },
        responses: {
          200: {
            description: 'Lesson content generated successfully',
            content: {
              'application/json': {
                schema: generateLessonResponseSchema,
              },
            },
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Roadmap id and lesson id are required',
                  code: 'VALIDATION_ERROR',
                }),
              },
            },
          },
          401: unauthorizedResponse,
          409: {
            description: 'Generation already in progress',
            content: {
              'application/json': {
                schema: generateLessonResponseSchema,
              },
            },
          },
          429: rateLimitedResponse,
          500: {
            description: 'Generation failed or internal error',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    generateLessonResponseSchema,
                    errorSchema({
                      error: 'Something went wrong. Please try again.',
                      code: 'INTERNAL_ERROR',
                    }),
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/roadmaps/{id}/exercises': {
      get: {
        tags: ['Roadmaps'],
        summary: 'List roadmap exercises',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'lessonId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'sectionId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Exercise list' },
          401: unauthorizedResponse,
          404: { description: 'Roadmap not found' },
        },
      },
    },
    '/api/v1/roadmaps/{id}/lessons/{lessonId}/exercises/generate': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Generate 2–3 lesson exercises (LangGraph)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'lessonId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          201: { description: 'Exercises created' },
          401: unauthorizedResponse,
          409: { description: 'Soft cap or skipped lesson' },
          429: rateLimitedResponse,
          502: { description: 'LLM failure' },
        },
      },
    },
    '/api/v1/roadmaps/{id}/exercises/{exerciseId}/complete': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Mark exercise complete (activity day + optional +5 rating)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'exerciseId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['local_date'],
                properties: {
                  local_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Exercise completed' },
          401: unauthorizedResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}/exercises/{exerciseId}/incomplete': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Mark exercise incomplete (no rating clawback)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'exerciseId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Exercise marked incomplete' },
          401: unauthorizedResponse,
        },
      },
    },
    '/api/v1/roadmaps/{id}/exercises/{exerciseId}/regenerate': {
      post: {
        tags: ['Roadmaps'],
        summary: 'Regenerate one exercise',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'exerciseId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Exercise regenerated' },
          401: unauthorizedResponse,
          429: rateLimitedResponse,
          502: { description: 'LLM failure' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Technique: techniqueSchema,
      Plan: {
        type: 'object',
        properties: {
          planId: { type: 'string', example: 'plan_abc123' },
          hobby: { type: 'string', example: 'Photography' },
          goal: { type: 'string', example: 'Take better portrait photos' },
          level: { type: 'string', enum: planLevelEnum, example: 'beginner' },
          estimatedDuration: { type: 'string', example: '4 weeks' },
          generatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-07-09T09:00:00.000Z',
          },
          techniques: {
            type: 'array',
            items: techniqueSchema,
          },
        },
      },
      ChatMessage: chatMessageSchema,
      MindMapNode: mindMapNodeSchema,
      RoadmapMindMap: roadmapMindMapSchema,
      GenerateLessonResponse: generateLessonResponseSchema,
      ClarificationResponse: clarificationResponseSchema,
      GoalSuggestionResponse: goalSuggestionResponseSchema,
      LessonPlanResponse: lessonPlanResponseSchema,
      GoalCard: goalCardSchema,
      MaterializeLessonPlan: materializeLessonPlanSchema,
      PublicLessonMediaAsset: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          kind: { type: 'string', enum: lessonMediaKindEnum },
          url: { type: 'string' },
          storagePath: { type: 'string' },
          title: { type: 'string' },
          alt: { type: 'string' },
          source: {
            type: 'object',
            properties: {
              provider: { type: 'string', enum: mediaProviderEnum },
              externalId: { type: 'string' },
              sourceUrl: { type: 'string' },
              fetchedAt: { type: 'string' },
            },
          },
          durationSeconds: { type: 'number' },
          thumbnailUrl: { type: 'string' },
        },
      },
    },
  },
} as const;
