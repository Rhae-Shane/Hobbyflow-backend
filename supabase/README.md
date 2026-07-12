# Supabase — HobbyFlow

Database schema and migrations for HobbyFlow auth + plan sync.

## What this covers

| Table | Purpose |
|-------|---------|
| `users` | One row per auth user — identity fields from Supabase Auth |
| `user_preferences` | Onboarding choices — one row per user, typed columns + `text[]` for multi-select |
| `hobbies` | One user → many hobbies (`user_id` FK with `ON DELETE CASCADE`) |
| `user_plans` | One plan per hobby — plan JSON, onboarding profile, streak |
| `roadmaps` | Spec 13: structured roadmap from approved outline (intro, cover, status) |
| `roadmap_nodes` | Spec 13: Section + Lesson nodes |
| `roadmap_lessons` | Spec 13: ordered learning path (`pending_content` until generated) |
| `chat_conversations` | Spec 12: creation/coach chat persistence |
| `admins` | Privileged users (`user_id` → `users.id`); paste IDs via Dashboard |

The Expo app uses the **anon key** + user session for most reads/writes (RLS). The Express API uses the **service role key** for JWT verification and Spec 13 roadmap materialization (`roadmaps` / nodes / lessons).

**Admins:** Insert a row into `public.admins` with a `user_id` from `public.users` (Table Editor or SQL). That user then passes RLS policy `ADMIN_can_do_all_ops` on every public table via `public.is_admin()`. First admin must be added in the Dashboard (bypasses RLS).

## Apply schema

### Option A — Supabase CLI (recommended)

```bash
# Install CLI: https://supabase.com/docs/guides/cli
# On Windows, use npx or npm scripts (global `supabase` is not supported via npm -g)
cd hobbyflow-server
npm install
npm run db:login
npm run db:link -- --project-ref <your-project-ref>
# Add SUPABASE_DB_PASSWORD to .env (Dashboard → Project Settings → Database)
npm run db:push
```

**Troubleshooting**

| Error | Fix |
|-------|-----|
| `Cannot prompt for input in JSON output mode` | Run commands in your own terminal (not via an agent). Scripts already pass `--agent no`. |
| `does not have the necessary privileges` (403) | `npm run db:login` with the Supabase account that owns this project, then re-link. |
| `SUPABASE_DB_PASSWORD` | Copy the database password from Dashboard → Project Settings → Database into `.env`. |

Non-interactive login (CI / token): `npm run db:login -- --token <access-token>` — create a token at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).

### Option B — SQL Editor

1. Open your project in [supabase.com](https://supabase.com).
2. Paste and run `supabase/schema.sql` (idempotent).

## Auth setup (Dashboard)

1. **Authentication → Providers** — enable **Email** and **Google**.
2. **Authentication → URL Configuration** — add redirect URLs:
   - `hobbyflow://`
   - `exp://127.0.0.1:8081` (Expo Go local dev)
3. Copy keys into env files:
   - **App:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - **Server:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never expose to the client)

## Migrations

| File | Description |
|------|-------------|
| `migrations/20260709140000_initial_schema.sql` | Profiles, user_plans, RLS, signup trigger |
| `migrations/20260709150000_profiles_auth_fields.sql` | Provider, email_verified, profile sync on auth update + backfill |
| `migrations/20260709160000_profiles_preferences.sql` | Legacy `preferences` JSONB on profiles (superseded) |
| `migrations/20260709170000_user_preferences_table.sql` | `user_preferences` table; migrates JSONB; drops `profiles.preferences` |
| `migrations/20260709180000_users_and_hobbies.sql` | Rename `profiles` → `users`; add `hobbies`; `user_plans` per hobby |
| `migrations/20260710120000_users_completed_onboarding.sql` | `users.completed_onboarding_at` onboarding gate |

Add new migrations with:

```bash
supabase migration new <description>
```

## Row Level Security

- Users can **select / insert / update** only their own `users`, `user_preferences`, `hobbies`, and `user_plans` rows.
- Deleting a user (via `auth.users`) cascades to `users` → `hobbies` → `user_plans`.
- No **delete** policies for normal users — plan clearing is local-only; rows persist for cross-device sync.
- **Admins** (`public.admins`): `ADMIN_can_do_all_ops` + `public.is_admin()` allow full CRUD on all public tables for listed `user_id`s.
- `service_role` bypasses RLS (server JWT verification only; never ship to the client).
