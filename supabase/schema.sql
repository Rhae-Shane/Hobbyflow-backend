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
  feature_introductions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_completed_onboarding_at_idx
  on public.users (completed_onboarding_at)
  where completed_onboarding_at is not null;

create table if not exists public.user_preferences (
  user_id uuid references public.users on delete cascade primary key,
  top_goals text[] not null default '{}',
  user_roles text[] not null default '{}',
  age_range text not null default '',
  accessibility_needs text[] not null default '{}',
  learning_strengths text[] not null default '{}',
  practice_environments text[] not null default '{}',
  resource_budget text not null default '',
  learning_styles text[] not null default '{}',
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
create index if not exists user_preferences_top_goals_idx
  on public.user_preferences using gin (top_goals);
create index if not exists user_preferences_accessibility_needs_idx
  on public.user_preferences using gin (accessibility_needs);
create index if not exists user_preferences_practice_environments_idx
  on public.user_preferences using gin (practice_environments);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  hobby_id uuid references public.hobbies (id) on delete set null,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint chat_conversations_messages_is_array
    check (jsonb_typeof(messages) = 'array'),
  constraint chat_conversations_context_is_object
    check (jsonb_typeof(context) = 'object')
);

create index if not exists chat_conversations_user_id_idx
  on public.chat_conversations (user_id);

create index if not exists chat_conversations_user_workflow_idx
  on public.chat_conversations (user_id, ((context->>'workflow')))
  where archived_at is null;

alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.hobbies enable row level security;
alter table public.user_plans enable row level security;
alter table public.chat_conversations enable row level security;

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

create policy "chat_conversations_select_own"
  on public.chat_conversations for select
  using (auth.uid() = user_id);

create policy "chat_conversations_insert_own"
  on public.chat_conversations for insert
  with check (auth.uid() = user_id);

create policy "chat_conversations_update_own"
  on public.chat_conversations for update
  using (auth.uid() = user_id);

create policy "chat_conversations_delete_own"
  on public.chat_conversations for delete
  using (auth.uid() = user_id);

grant select, insert, update on table public.users to authenticated;
grant select, insert, update on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.hobbies to authenticated;
grant select, insert, update on table public.user_plans to authenticated;
grant select, insert, update, delete on table public.chat_conversations to authenticated;

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

-- ---------------------------------------------------------------------------
-- Spec 18 — gamification (streak, rating, savers) + daily tasks
-- ---------------------------------------------------------------------------

create table if not exists public.user_gamification (
  user_id uuid primary key references public.users (id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  streak_savers integer not null default 3 check (streak_savers >= 0 and streak_savers <= 99),
  activity_dates text[] not null default '{}',
  saver_used_dates text[] not null default '{}',
  last_activity_date date,
  rating integer not null default 699 check (rating >= 699),
  peak_rating integer not null default 699 check (peak_rating >= 699),
  league_id text default 'wood',
  pacts_fulfilled integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_gamification_rating_idx
  on public.user_gamification (rating desc, longest_streak desc);

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  hobby_id uuid references public.hobbies (id) on delete set null,
  task_date date not null,
  task_type text not null check (task_type in ('complete_lesson', 'practice_minutes')),
  title text not null,
  rating_reward integer not null default 10 check (rating_reward > 0),
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_tasks_user_date_unique unique (user_id, task_date)
);

create index if not exists daily_tasks_user_date_idx
  on public.daily_tasks (user_id, task_date desc);

alter table public.user_gamification enable row level security;
alter table public.daily_tasks enable row level security;

drop policy if exists "user_gamification_select_authenticated" on public.user_gamification;
drop policy if exists "user_gamification_insert_own" on public.user_gamification;
drop policy if exists "user_gamification_update_own" on public.user_gamification;
drop policy if exists "daily_tasks_select_own" on public.daily_tasks;
drop policy if exists "daily_tasks_insert_own" on public.daily_tasks;
drop policy if exists "daily_tasks_update_own" on public.daily_tasks;
drop policy if exists "daily_tasks_delete_own" on public.daily_tasks;

create policy "user_gamification_select_authenticated"
  on public.user_gamification for select
  to authenticated
  using (true);

create policy "user_gamification_insert_own"
  on public.user_gamification for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_gamification_update_own"
  on public.user_gamification for update
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_tasks_select_own"
  on public.daily_tasks for select
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_tasks_insert_own"
  on public.daily_tasks for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "daily_tasks_update_own"
  on public.daily_tasks for update
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_tasks_delete_own"
  on public.daily_tasks for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update on table public.user_gamification to authenticated;
grant select, insert, update, delete on table public.daily_tasks to authenticated;

alter table public.users
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz,
  add column if not exists is_profile_public boolean not null default true,
  add column if not exists bio text not null default '';

create unique index if not exists users_username_unique_ci
  on public.users (lower(username))
  where username is not null;

create or replace view public.ranking_profiles as
select
  id as user_id,
  coalesce(
    nullif(username, ''),
    nullif(trim(full_name), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Learner'
  ) as display_name,
  username
from public.users;

grant select on public.ranking_profiles to authenticated;

drop trigger if exists set_user_gamification_updated_at on public.user_gamification;
create trigger set_user_gamification_updated_at
  before update on public.user_gamification
  for each row execute function public.set_updated_at();

drop trigger if exists set_daily_tasks_updated_at on public.daily_tasks;
create trigger set_daily_tasks_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Spec 19 — leagues + rating
-- ---------------------------------------------------------------------------

create table if not exists public.leagues (
  id text primary key,
  name text not null,
  sort_order integer not null unique,
  min_rating integer not null,
  max_rating integer not null,
  color_hex text not null default '#8B8178',
  icon_key text not null default 'shield',
  created_at timestamptz not null default now(),
  constraint leagues_rating_band check (min_rating <= max_rating)
);

insert into public.leagues (id, name, sort_order, min_rating, max_rating, color_hex, icon_key)
values
  ('wood', 'Wood', 1, 699, 799, '#A67C52', 'wood'),
  ('bronze', 'Bronze', 2, 800, 999, '#CD7F32', 'bronze'),
  ('silver', 'Silver', 3, 1000, 1199, '#C0C0C0', 'silver'),
  ('gold', 'Gold', 4, 1200, 1399, '#D4AF37', 'gold'),
  ('platinum', 'Platinum', 5, 1400, 1599, '#7CCBFA', 'platinum'),
  ('diamond', 'Diamond', 6, 1600, 1799, '#5BB8F0', 'diamond'),
  ('master', 'Master', 7, 1800, 1999, '#7C3AED', 'master'),
  ('legend', 'Legend', 8, 2000, 99999, '#E11D48', 'legend')
on conflict (id) do nothing;

alter table public.leagues enable row level security;
drop policy if exists "leagues_select_authenticated" on public.leagues;
create policy "leagues_select_authenticated"
  on public.leagues for select to authenticated using (true);
grant select on table public.leagues to authenticated;

-- ---------------------------------------------------------------------------
-- Spec 20 — The Pact
-- ---------------------------------------------------------------------------

alter table public.user_gamification
  add column if not exists pacts_fulfilled integer not null default 0;

create table if not exists public.user_pacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  hobby_id uuid not null references public.hobbies (id) on delete cascade,
  promise_text text not null
    check (char_length(promise_text) between 8 and 200),
  start_date date not null,
  end_date date not null,
  status text not null default 'active'
    check (status in ('active', 'fulfilled', 'broken')),
  fulfilled_at timestamptz,
  broken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_pacts_duration_ok check (
    end_date >= (start_date + 6)
  )
);

create unique index if not exists user_pacts_one_active_per_user
  on public.user_pacts (user_id)
  where status = 'active';

create index if not exists user_pacts_user_created_idx
  on public.user_pacts (user_id, created_at desc);

alter table public.user_pacts enable row level security;

drop policy if exists "user_pacts_select_own" on public.user_pacts;
drop policy if exists "user_pacts_insert_own" on public.user_pacts;
drop policy if exists "user_pacts_update_own" on public.user_pacts;
drop policy if exists "user_pacts_delete_own" on public.user_pacts;

create policy "user_pacts_select_own"
  on public.user_pacts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_pacts_insert_own"
  on public.user_pacts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_pacts_update_own"
  on public.user_pacts for update
  to authenticated
  using (auth.uid() = user_id);

create policy "user_pacts_delete_own"
  on public.user_pacts for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_pacts to authenticated;

drop trigger if exists set_user_pacts_updated_at on public.user_pacts;
create trigger set_user_pacts_updated_at
  before update on public.user_pacts
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Spec 19 — profile search / public profile RPCs (rating-only)
-- ---------------------------------------------------------------------------

create or replace function public.search_profiles(q text, lim int default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  rating integer,
  league_id text,
  current_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    g.rating,
    g.league_id,
    g.current_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.is_profile_public = true
    and u.username is not null
    and length(lower(trim(both from coalesce(q, '')))) >= 2
    and u.username like lower(trim(both from q)) || '%'
  order by u.username
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_profiles(text, int) to authenticated;

create or replace function public.get_public_profile(p_username text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  rating integer,
  peak_rating integer,
  league_id text,
  current_streak integer,
  longest_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    u.bio,
    g.rating,
    g.peak_rating,
    g.league_id,
    g.current_streak,
    g.longest_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.is_profile_public = true
    and u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;
