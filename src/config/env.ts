import 'dotenv/config';

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

function resolveLogLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && VALID_LOG_LEVELS.includes(configured)) {
    return configured;
  }
  return (process.env.NODE_ENV ?? 'development') === 'production' ? 'info' : 'debug';
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: resolveLogLevel(),
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  PLAN_CACHE_TTL_MS: Number(process.env.PLAN_CACHE_TTL_MS ?? 86_400_000),
  SUPABASE_URL: process.env.SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '',
  SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL ?? '',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
} as const;
