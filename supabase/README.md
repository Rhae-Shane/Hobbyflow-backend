# Supabase — HobbyFlow

Database schema and migrations for HobbyFlow auth + plan sync.

## What this covers

| Table | Purpose |
|-------|---------|
| `profiles` | One row per auth user (auto-created on signup via trigger) |
| `user_plans` | Plan JSON, onboarding profile, streak — synced from the mobile app |

The Express API **does not** read or write these tables. The app uses the **anon key** + user session; RLS restricts each user to their own rows. The server only uses the **service role key** for `auth.getUser(token)` JWT verification.

## Apply schema

### Option A — Supabase CLI (recommended)

```bash
# Install CLI: https://supabase.com/docs/guides/cli
cd hobbyflow-server
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

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

Add new migrations with:

```bash
supabase migration new <description>
```

## Row Level Security

- Users can **select / insert / update** only their own `profiles` and `user_plans` rows.
- No **delete** policies — plan clearing is local-only; rows persist for cross-device sync.
- `service_role` bypasses RLS (server JWT verification only; never ship to the client).
