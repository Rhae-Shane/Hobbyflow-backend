-- Rename profiles → users, add hobbies (one user → many hobbies),
-- restructure user_plans to one plan per hobby with CASCADE FKs through public.users.

-- ---------------------------------------------------------------------------
-- 1. profiles → users
-- ---------------------------------------------------------------------------

alter table public.profiles rename to users;

alter policy "profiles_select_own" on public.users rename to "users_select_own";
alter policy "profiles_insert_own" on public.users rename to "users_insert_own";
alter policy "profiles_update_own" on public.users rename to "users_update_own";

alter trigger set_profiles_updated_at on public.users rename to set_users_updated_at;

-- ---------------------------------------------------------------------------
-- 2. Point child tables at public.users (ON DELETE CASCADE)
-- ---------------------------------------------------------------------------

alter table public.user_preferences
  drop constraint user_preferences_user_id_fkey;

alter table public.user_preferences
  add constraint user_preferences_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;

-- user_plans.user_id FK is replaced when the table is rebuilt (step 4).

-- ---------------------------------------------------------------------------
-- 3. hobbies — one user, many hobbies
-- ---------------------------------------------------------------------------

create table public.hobbies (
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

create index hobbies_user_id_idx on public.hobbies (user_id);
create index hobbies_user_active_idx on public.hobbies (user_id, is_active)
  where is_active = true;

alter table public.hobbies enable row level security;

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

grant select, insert, update, delete on table public.hobbies to authenticated;

create trigger set_hobbies_updated_at
  before update on public.hobbies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. user_plans — one row per hobby (was one row per user)
-- ---------------------------------------------------------------------------

create table public.user_plans_new (
  hobby_id uuid primary key references public.hobbies (id) on delete cascade,
  plan jsonb,
  profile jsonb,
  streak_days integer not null default 0 check (streak_days >= 0),
  updated_at timestamptz not null default now()
);

create index user_plans_new_updated_at_idx on public.user_plans_new (updated_at desc);

-- Backfill hobbies from legacy per-user plans
insert into public.hobbies (user_id, name, level, goal, is_active)
select
  up.user_id,
  trim(coalesce(up.plan->>'hobby', up.profile->>'hobby', 'My Hobby')),
  coalesce(up.plan->>'level', up.profile->>'level', 'beginner'),
  coalesce(up.plan->>'goal', up.profile->>'goal', ''),
  true
from public.user_plans up
on conflict (user_id, name) do nothing;

insert into public.user_plans_new (hobby_id, plan, profile, streak_days, updated_at)
select
  h.id,
  up.plan,
  up.profile,
  up.streak_days,
  up.updated_at
from public.user_plans up
join public.hobbies h
  on h.user_id = up.user_id
 and h.name = trim(coalesce(up.plan->>'hobby', up.profile->>'hobby', 'My Hobby'));

drop table public.user_plans;

alter table public.user_plans_new rename to user_plans;

alter index user_plans_new_updated_at_idx rename to user_plans_updated_at_idx;

alter table public.user_plans enable row level security;

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

grant select, insert, update on table public.user_plans to authenticated;

create trigger set_user_plans_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Auth triggers — write to public.users
-- ---------------------------------------------------------------------------

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
