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

/** Primary key plus optional comma/newline-separated extras (rate-limit failover). */
function resolveGroqApiKeys(): string[] {
  const fromList = (process.env.GROQ_API_KEYS ?? '')
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const primary = (process.env.GROQ_API_KEY ?? '').trim();
  const keys = [...(primary ? [primary] : []), ...fromList];
  return [...new Set(keys)];
}

const groqApiKeys = resolveGroqApiKeys();

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: resolveLogLevel(),
  /** @deprecated Prefer GROQ_API_KEYS; kept for single-key setups */
  GROQ_API_KEY: groqApiKeys[0] ?? '',
  GROQ_API_KEYS: groqApiKeys,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  PLAN_CACHE_TTL_MS: Number(process.env.PLAN_CACHE_TTL_MS ?? 86_400_000),
  SUPABASE_URL: process.env.SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '',
  SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL ?? '',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID ?? '',
  /** Set by deploy script so /version can prove which commit is live */
  DEPLOY_GIT_SHA: process.env.DEPLOY_GIT_SHA ?? '',
  DEPLOY_GIT_SHORT: process.env.DEPLOY_GIT_SHORT ?? '',
  DEPLOYED_AT: process.env.DEPLOYED_AT ?? '',
  /** Sentry DSN — optional; errors are reported when set */
  SENTRY_DSN: process.env.SENTRY_DSN ?? '',
} as const;
