import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  PLAN_CACHE_TTL_MS: Number(process.env.PLAN_CACHE_TTL_MS ?? 86_400_000),
  SUPABASE_URL: process.env.SUPABASE_URL ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const;
