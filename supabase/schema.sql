-- HobbyFlow Supabase schema (idempotent — safe to re-run in SQL Editor)
-- Canonical source: supabase/migrations/
-- Prefer `supabase db push` when using the Supabase CLI.

create table if not exists public.users (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  email_verified boolean not null default false,
  completed_onboarding_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_completed_onboarding_at_idx
  on public.users (completed_onboarding_at)
  where completed_onboarding_at is not null;

create table if not exists public.user_preferences (
  user_id uuid references public.users on delete cascade primary key,
  top_goals text[] not null default '{}',
  selected_tags text[] not null default '{}',
  user_roles text[] not null default '{}',
  learning_styles text[] not null default '{}',
  daily_goal text not null default '',
  content_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hobbies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  level text not null default 'beginner'
    check (level in ('beginner', 'intermediate', 'advanced')),
  goal text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hobbies_user_name_unique unique (user_id, name)
);

create table if not exists public.user_plans (
  hobby_id uuid primary key references public.hobbies (id) on delete cascade,
  plan jsonb,
  profile jsonb,
  streak_days integer not null default 0 check (streak_days >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists hobbies_user_id_idx on public.hobbies (user_id);
create index if not exists hobbies_user_active_idx on public.hobbies (user_id, is_active)
  where is_active = true;
create index if not exists user_plans_updated_at_idx on public.user_plans (updated_at desc);
create index if not exists user_preferences_selected_tags_idx
  on public.user_preferences using gin (selected_tags);
create index if not exists user_preferences_top_goals_idx
  on public.user_preferences using gin (top_goals);

alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.hobbies enable row level security;
alter table public.user_plans enable row level security;

drop policy if exists "users_select_own" on public.users;
drop policy if exists "users_insert_own" on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "profiles_select_own" on public.users;
drop policy if exists "profiles_insert_own" on public.users;
drop policy if exists "profiles_update_own" on public.users;
drop policy if exists "user_preferences_select_own" on public.user_preferences;
drop policy if exists "user_preferences_insert_own" on public.user_preferences;
drop policy if exists "user_preferences_update_own" on public.user_preferences;
drop policy if exists "hobbies_select_own" on public.hobbies;
drop policy if exists "hobbies_insert_own" on public.hobbies;
drop policy if exists "hobbies_update_own" on public.hobbies;
drop policy if exists "hobbies_delete_own" on public.hobbies;
drop policy if exists "user_plans_select_own" on public.user_plans;
drop policy if exists "user_plans_insert_own" on public.user_plans;
drop policy if exists "user_plans_update_own" on public.user_plans;

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

create policy "user_preferences_select_own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id);

create policy "hobbies_select_own"
  on public.hobbies for select
  using (auth.uid() = user_id);

create policy "hobbies_insert_own"
  on public.hobbies for insert
  with check (auth.uid() = user_id);

create policy "hobbies_update_own"
  on public.hobbies for update
  using (auth.uid() = user_id);

create policy "hobbies_delete_own"
  on public.hobbies for delete
  using (auth.uid() = user_id);

create policy "user_plans_select_own"
  on public.user_plans for select
  using (
    exists (
      select 1
      from public.hobbies h
      where h.id = hobby_id
        and h.user_id = auth.uid()
    )
  );

create policy "user_plans_insert_own"
  on public.user_plans for insert
  with check (
    exists (
      select 1
      from public.hobbies h
      where h.id = hobby_id
        and h.user_id = auth.uid()
    )
  );

create policy "user_plans_update_own"
  on public.user_plans for update
  using (
    exists (
      select 1
      from public.hobbies h
      where h.id = hobby_id
        and h.user_id = auth.uid()
    )
  );

grant select, insert, update on table public.users to authenticated;
grant select, insert, update on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.hobbies to authenticated;
grant select, insert, update on table public.user_plans to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
drop trigger if exists set_profiles_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists set_hobbies_updated_at on public.hobbies;
create trigger set_hobbies_updated_at
  before update on public.hobbies
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_plans_updated_at on public.user_plans;
create trigger set_user_plans_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, provider, email_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.raw_app_meta_data->>'provider', new.raw_app_meta_data->'providers'->>0),
    coalesce((new.raw_user_meta_data->>'email_verified')::boolean, new.email_confirmed_at is not null)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    provider = coalesce(new.raw_app_meta_data->>'provider', new.raw_app_meta_data->'providers'->>0),
    email_verified = coalesce((new.raw_user_meta_data->>'email_verified')::boolean, new.email_confirmed_at is not null),
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();
