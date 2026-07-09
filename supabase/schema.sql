-- HobbyFlow Supabase schema (idempotent — safe to re-run in SQL Editor)
-- Canonical source: supabase/migrations/20260709140000_initial_schema.sql
-- Prefer `supabase db push` when using the Supabase CLI.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_plans (
  user_id uuid references auth.users on delete cascade primary key,
  plan jsonb,
  profile jsonb,
  streak_days integer not null default 0 check (streak_days >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists user_plans_updated_at_idx on public.user_plans (updated_at desc);

alter table public.profiles enable row level security;
alter table public.user_plans enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "user_plans_select_own" on public.user_plans;
drop policy if exists "user_plans_insert_own" on public.user_plans;
drop policy if exists "user_plans_update_own" on public.user_plans;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "user_plans_select_own"
  on public.user_plans for select
  using (auth.uid() = user_id);

create policy "user_plans_insert_own"
  on public.user_plans for insert
  with check (auth.uid() = user_id);

create policy "user_plans_update_own"
  on public.user_plans for update
  using (auth.uid() = user_id);

grant select, insert, update on table public.profiles to authenticated;
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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_plans_updated_at on public.user_plans;
create trigger set_user_plans_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
