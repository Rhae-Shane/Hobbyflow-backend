# HobbyFlow Server

**Go with your hobby's flow.**

Node.js / Express API for HobbyFlow — AI-assisted learning plans, roadmap creation, lesson generation, daily tasks, and coach chat. The mobile client is **[Hobbyflow-app](https://github.com/Rhae-Shane/Hobbyflow-app)** (Expo).

User data lives in **Supabase** (Auth + Postgres + RLS). This service validates JWTs, runs the AI pipeline, and materializes roadmaps/lessons with the service role where needed.

---

## Stack

| Piece | Choice |
|-------|--------|
| Runtime | Node.js 22, Express 5, TypeScript |
| Validation | Zod |
| Logging | Pino (+ `pino-http`) |
| Auth | Supabase JWT (JWKS) |
| AI | LangChain / LangGraph — **Groq** → **OpenRouter** (free) → **Vercel AI Gateway** |
| Tracing | Optional LangSmith |
| DB schema | Supabase migrations in `supabase/` |
| Observability | Sentry (`@sentry/node`) |
| Deploy | Docker + droplet scripts (`1_build.sh`, `2_start.sh`, PM2) |

---

## Prerequisites

- Node.js 20+ (22 recommended; Docker image uses 22)
- npm
- Supabase project + CLI access for migrations
- At least one LLM key: `GROQ_API_KEY` (recommended), optionally OpenRouter / AI Gateway

---

## Quick start

```bash
cp .env.example .env
# Fill keys (see Environment variables)
npm install
npm run dev
```

- Health: `GET http://localhost:3000/health`
- OpenAPI: `GET http://localhost:3000/openapi.json`
- Default port: `3000` (`predev` frees the port via `kill-port`)

---

## Environment variables

Copy `.env.example` → `.env`. Never commit real secrets. Service role / API keys stay server-side only.

### Core

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | No | Listen port (default `3000`) |
| `NODE_ENV` | No | `development` / `production` |
| `LOG_LEVEL` | No | Pino level (`debug`, `info`, …) |
| `SUPABASE_URL` | Yes | Project URL |
| `SUPABASE_ANON_KEY` | Yes | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Privileged server ops (keep secret) |
| `SUPABASE_JWKS_URL` | Yes | JWT verification JWKS |

### AI (cascade)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Strongly recommended | Primary LLM |
| `GROQ_API_KEYS` | No | Comma-separated extras when a key hits TPM/RPM |
| `OPENROUTER_API_KEY` | No | Free-model fallback |
| `OPENROUTER_MODEL` | No | Default `openai/gpt-oss-120b:free` |
| `AI_GATEWAY_API_KEY` | No | Last-resort paid/credit fallback |
| `AI_GATEWAY_MODEL` | No | Default `google/gemini-2.5-flash-lite` |
| `OPENAI_API_KEY` | No | Optional OpenAI-compatible use |

### Optional integrations

| Variable | Purpose |
|----------|---------|
| `PLAN_CACHE_TTL_MS` | In-memory plan dedup TTL (default 24h) |
| `LANGSMITH_*` | LangGraph / LangChain traces |
| `TAVILY_API_KEY` | Web search grounding |
| `YOUTUBE_API_KEY` / `GOOGLE_API_KEY` / `GOOGLE_CSE_ID` | Lesson media resolve |
| `SENTRY_DSN` | Server error reporting |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm test` | Jest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:login` | Supabase CLI login |
| `npm run db:link` | Link local folder to a project |
| `npm run db:push` | Push migrations |
| `npm run db:reset` | Reset local DB (destructive) |
| `npm run test:langsmith` | LangSmith smoke script |
| `npm run test:roadmap-creation` | Roadmap creation graph script |
| `npm run test:lesson-generation` | Lesson generation graph script |

---

## API surface (`/api/v1`)

| Prefix | Role |
|--------|------|
| `/auth` | Auth-related helpers |
| `/plans` | Learning plan generate / replace |
| `/chat` | Coach chat |
| `/roadmap-creation-chat` | Guided roadmap creation conversation |
| `/roadmaps` | Roadmap materialization & lesson content |
| `/ask-anything` | Ad-hoc hobby Q&A |
| `/daily-tasks` | Daily practice tasks |
| `/leaderboard` | Leaderboard |

Also: `GET /health`, `GET /version`, `GET /api/v1/ping`, `GET /openapi.json`.

Most routes expect a Supabase bearer token. Exact shapes are in OpenAPI and Zod schemas under `src/schemas/`.

---

## AI pipeline (why this cascade)

Plan / lesson generation is blocking and user-facing — free-tier limits matter.

| Provider | Role |
|----------|------|
| **Groq** | Primary — fast, high free RPM |
| **OpenRouter** | Fallback when Groq rate-limits or errors |
| **Vercel AI Gateway** | Last resort if both above fail |

The LLM returns structured metadata + search queries (not invented URLs). Responses are validated with Zod; modality rules clamp resource types per hobby (e.g. chess: no audio).

---

## Supabase schema & migrations

Schema and migrations live in `supabase/` (see `supabase/README.md`).

```bash
npm install
npm run db:login
npm run db:link -- --project-ref <your-project-ref>
# Set SUPABASE_DB_PASSWORD in .env (Dashboard → Database)
npm run db:push
```

Or paste `supabase/schema.sql` into the Supabase SQL Editor.

**Auth redirects** (for the Expo app):

- `hobbyflow://auth/callback`
- `hobbyflow://**`
- `exp://127.0.0.1:8081`

Enable Email + Google providers in the Dashboard.

---

## Project layout

```
src/
  index.ts           # App entry, route mount
  routes/            # HTTP routers
  schemas/           # Zod request/response schemas
  services/          # Planner, LangGraph graphs, media, etc.
  middleware/        # Auth, errors, logging
  config/            # Env / constants
supabase/            # Migrations + schema.sql
deploy/              # Deploy helpers
tests/               # Jest tests
Dockerfile           # Multi-stage production image
1_build.sh / 2_start.sh   # Droplet build & start
ecosystem.config.js  # PM2
```

---

## Docker

```bash
docker build -t hobbyflow-server .
docker run --env-file .env -p 3000:3000 hobbyflow-server
```

Image healthcheck hits `/health`. Production process typically: build → `node dist/index.js` (or PM2 via `ecosystem.config.js`).

---

## Tests

```bash
npm test
npm run typecheck
```

Graph smoke scripts (`test:roadmap-creation`, `test:lesson-generation`) need valid LLM + Supabase env.

---

## Related repo

| Repo | Role |
|------|------|
| [Hobbyflow-app](https://github.com/Rhae-Shane/Hobbyflow-app) | Expo mobile client — set `EXPO_PUBLIC_API_URL` to this API |

Local pair: run this server on `:3000`, then start the app with `EXPO_PUBLIC_API_URL=http://localhost:3000` (or your LAN IP on a physical device).
