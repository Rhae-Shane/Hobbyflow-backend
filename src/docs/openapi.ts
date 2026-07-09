import { env } from '../config/env';

const planLevelEnum = ['beginner', 'intermediate', 'advanced'];
const timeBudgetEnum = ['15 min/day', '30 min/day', '1 hr/day'];
const modalityEnum = ['video', 'article', 'audio', 'interactive'];
const techniqueStatusEnum = ['todo', 'in_progress', 'mastered', 'skipped'];

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
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns service availability for load balancers and uptime monitors.',
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
                  },
                },
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
          'Obtain a Supabase JWT for testing protected endpoints. Use provider `email` for instant token, or `google` to get an OAuth URL (complete sign-in in the browser, then copy the token from the callback page).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['provider', 'email', 'password'],
                    properties: {
                      provider: { type: 'string', enum: ['email'], example: 'email' },
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
                  {
                    type: 'object',
                    required: ['provider'],
                    properties: {
                      provider: { type: 'string', enum: ['google'], example: 'google' },
                    },
                  },
                ],
              },
              examples: {
                email: {
                  summary: 'Email sign-in',
                  value: {
                    provider: 'email',
                    email: 'omesh@gmail.com',
                    password: 'test@123',
                  },
                },
                google: {
                  summary: 'Google sign-in',
                  value: {
                    provider: 'google',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Token issued (email) or OAuth URL returned (google)',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        refreshToken: { type: 'string', example: 'v1.MRj...' },
                        expiresIn: { type: 'integer', example: 3600 },
                        userId: { type: 'string', example: '33277cf6-c13a-46bb-892b-aa15d643144b' },
                        email: { type: 'string', example: 'omesh@gmail.com' },
                      },
                    },
                    {
                      type: 'object',
                      properties: {
                        provider: { type: 'string', example: 'google' },
                        url: {
                          type: 'string',
                          format: 'uri',
                          example: 'https://your-project.supabase.co/auth/v1/authorize?provider=google',
                        },
                        redirectTo: {
                          type: 'string',
                          format: 'uri',
                          example: 'http://localhost:3000/api/v1/auth/callback',
                        },
                        message: {
                          type: 'string',
                          example:
                            'Open the URL in a browser. After sign-in you will land on the callback page with your token.',
                        },
                      },
                    },
                  ],
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
    '/api/v1/auth/callback': {
      get: {
        tags: ['Authentication'],
        summary: 'Google OAuth callback',
        description:
          'Landing page after Google sign-in. Displays the access token to copy into API docs. Add this URL to Supabase → Authentication → URL Configuration → Redirect URLs.',
        responses: {
          200: {
            description: 'HTML page showing the access token',
            content: {
              'text/html': {
                schema: { type: 'string' },
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
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Please sign in to continue',
                  code: 'AUTH_MISSING_HEADER',
                }),
              },
            },
          },
          429: {
            description: 'Rate limit exceeded',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Too many requests. Please wait a few minutes and try again.',
                  code: 'RATE_LIMITED',
                }),
              },
            },
          },
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
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Something went wrong. Please try again.',
                  code: 'INTERNAL_ERROR',
                }),
              },
            },
          },
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
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Your session has expired. Please sign in again.',
                  code: 'AUTH_INVALID_SESSION',
                }),
              },
            },
          },
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
          429: {
            description: 'Rate limit exceeded',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Too many requests. Please wait a few minutes and try again.',
                  code: 'RATE_LIMITED',
                }),
              },
            },
          },
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
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: errorSchema({
                  error: 'Something went wrong. Please try again.',
                  code: 'INTERNAL_ERROR',
                }),
              },
            },
          },
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
    },
  },
} as const;
