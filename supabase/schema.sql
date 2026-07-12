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
  task_type text not null check (task_type in ('complete_lesson', 'practice_minutes', 'custom')),
  title text not null,
  rating_reward integer not null default 10 check (rating_reward > 0),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'discarded')),
  completed_at timestamptz,
  counts_for_rating boolean not null default true,
  regenerates_used integer not null default 0 check (regenerates_used >= 0 and regenerates_used <= 2),
  structured jsonb not null default '{}'::jsonb,
  rating_awarded integer not null default 0 check (rating_awarded >= 0),
  generated_by text not null default 'langgraph' check (generated_by in ('langgraph', 'legacy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_tasks_one_open_primary
  on public.daily_tasks (user_id, task_date)
  where status = 'open' and counts_for_rating = true;

create index if not exists daily_tasks_user_date_idx
  on public.daily_tasks (user_id, task_date desc);

create table if not exists public.daily_task_days (
  user_id uuid not null references public.users (id) on delete cascade,
  task_date date not null,
  regenerates_used integer not null default 0
    check (regenerates_used >= 0 and regenerates_used <= 2),
  rating_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_date)
);

alter table public.user_gamification enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.daily_task_days enable row level security;

drop policy if exists "user_gamification_select_authenticated" on public.user_gamification;
drop policy if exists "user_gamification_insert_own" on public.user_gamification;
drop policy if exists "user_gamification_update_own" on public.user_gamification;
drop policy if exists "daily_tasks_select_own" on public.daily_tasks;
drop policy if exists "daily_tasks_insert_own" on public.daily_tasks;
drop policy if exists "daily_tasks_update_own" on public.daily_tasks;
drop policy if exists "daily_tasks_delete_own" on public.daily_tasks;
drop policy if exists "daily_task_days_select_own" on public.daily_task_days;
drop policy if exists "daily_task_days_insert_own" on public.daily_task_days;
drop policy if exists "daily_task_days_update_own" on public.daily_task_days;
drop policy if exists "daily_task_days_delete_own" on public.daily_task_days;

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

create policy "daily_task_days_select_own"
  on public.daily_task_days for select
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_task_days_insert_own"
  on public.daily_task_days for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "daily_task_days_update_own"
  on public.daily_task_days for update
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_task_days_delete_own"
  on public.daily_task_days for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update on table public.user_gamification to authenticated;
grant select, insert, update, delete on table public.daily_tasks to authenticated;
grant select, insert, update, delete on table public.daily_task_days to authenticated;

alter table public.users
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz,
  add column if not exists bio text not null default '';

alter table public.users
  add column if not exists hobby_tags jsonb not null default '[]'::jsonb;

alter table public.users
  drop constraint if exists users_hobby_tags_is_array;

alter table public.users
  add constraint users_hobby_tags_is_array
  check (jsonb_typeof(hobby_tags) = 'array');

comment on column public.users.hobby_tags is
  'Profile interest tags from catalog matching during roadmap creation. Each element: {"hobbyId": number|null, "name": string, "source": "catalog"|"custom"}';

create index if not exists users_hobby_tags_gin_idx
  on public.users using gin (hobby_tags);

alter table public.users
  drop column if exists is_profile_public;

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

drop trigger if exists set_daily_task_days_updated_at on public.daily_task_days;
create trigger set_daily_task_days_updated_at
  before update on public.daily_task_days
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
  where u.username is not null
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
  hobby_tags jsonb,
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
    u.hobby_tags,
    g.rating,
    g.peak_rating,
    g.league_id,
    g.current_streak,
    g.longest_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Spec 21 — social feed posts, bio social links, post-media storage
-- ---------------------------------------------------------------------------

create table if not exists public.profile_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null,
  url text not null,
  handle text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_social_links_platform_check check (
    platform in (
      'instagram',
      'youtube',
      'tiktok',
      'x',
      'linkedin',
      'github',
      'website',
      'other'
    )
  ),
  constraint profile_social_links_url_https check (url ~* '^https://')
);

create unique index if not exists profile_social_links_user_platform_unique
  on public.profile_social_links (user_id, platform)
  where platform <> 'other';

create index if not exists profile_social_links_user_id_idx
  on public.profile_social_links (user_id, sort_order);

alter table public.profile_social_links enable row level security;

drop policy if exists "profile_social_links_select_auth" on public.profile_social_links;
drop policy if exists "profile_social_links_insert_own" on public.profile_social_links;
drop policy if exists "profile_social_links_update_own" on public.profile_social_links;
drop policy if exists "profile_social_links_delete_own" on public.profile_social_links;

create policy "profile_social_links_select_auth"
  on public.profile_social_links for select
  to authenticated
  using (true);

create policy "profile_social_links_insert_own"
  on public.profile_social_links for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profile_social_links_update_own"
  on public.profile_social_links for update
  to authenticated
  using (auth.uid() = user_id);

create policy "profile_social_links_delete_own"
  on public.profile_social_links for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.profile_social_links to authenticated;

drop trigger if exists set_profile_social_links_updated_at on public.profile_social_links;
create trigger set_profile_social_links_updated_at
  before update on public.profile_social_links
  for each row execute function public.set_updated_at();

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_caption_len check (char_length(caption) <= 2200)
);

create index if not exists posts_feed_idx
  on public.posts (created_at desc)
  where deleted_at is null;

create index if not exists posts_author_idx
  on public.posts (author_id, created_at desc)
  where deleted_at is null;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio')),
  storage_path text not null,
  public_url text not null,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_id_idx
  on public.post_media (post_id, sort_order);

alter table public.posts enable row level security;
alter table public.post_media enable row level security;

drop policy if exists "posts_select_auth" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;

create policy "posts_select_auth"
  on public.posts for select
  to authenticated
  using (deleted_at is null);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id);

drop policy if exists "post_media_select_auth" on public.post_media;
drop policy if exists "post_media_insert_own" on public.post_media;
drop policy if exists "post_media_delete_own" on public.post_media;

create policy "post_media_select_auth"
  on public.post_media for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.deleted_at is null
    )
  );

create policy "post_media_insert_own"
  on public.post_media for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create policy "post_media_delete_own"
  on public.post_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

grant select, insert, update on table public.posts to authenticated;
grant select, insert, delete on table public.post_media to authenticated;

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create or replace function public.list_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_author_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  caption text,
  created_at timestamptz,
  username text,
  display_name text,
  media jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.author_id,
    p.caption,
    p.created_at,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username) as display_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'kind', m.kind,
            'storage_path', m.storage_path,
            'public_url', m.public_url,
            'mime_type', m.mime_type,
            'width', m.width,
            'height', m.height,
            'duration_ms', m.duration_ms,
            'sort_order', m.sort_order
          )
          order by m.sort_order
        )
        from public.post_media m
        where m.post_id = p.id
      ),
      '[]'::jsonb
    ) as media
  from public.posts p
  join public.users u on u.id = p.author_id
  where p.deleted_at is null
    and u.username is not null
    and (p_author_id is null or p.author_id = p_author_id)
    and (
      p_before_created_at is null
      or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.list_feed(int, timestamptz, uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/x-m4a',
    'audio/m4a'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post_media_public_read" on storage.objects;
drop policy if exists "post_media_insert_own" on storage.objects;
drop policy if exists "post_media_update_own" on storage.objects;
drop policy if exists "post_media_delete_own" on storage.objects;

create policy "post_media_public_read"
  on storage.objects for select
  using (bucket_id = 'post-media');

create policy "post_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Hobby catalog: hobby_category + all_hobbies
-- ---------------------------------------------------------------------------

-- Hobby catalog: hobby_category + all_hobbies (normalized)
-- Duplicate display names across categories are allowed on all_hobbies; uniqueness is on id only.

-- Normalized hobby catalog from Project_Specs/hobbies-catalog.md
-- hobby_category (1-20) -> all_hobbies.category_id (1-1000)
-- Read-only for authenticated clients. User-owned hobbies stay in public.hobbies.

create table if not exists public.hobby_category (
  id integer primary key,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hobby_category_name_nonempty check (char_length(trim(name)) > 0),
  constraint hobby_category_name_unique unique (name),
  constraint hobby_category_sort_order_unique unique (sort_order)
);

create table if not exists public.all_hobbies (
  id integer primary key,
  name text not null,
  category_id integer not null references public.hobby_category (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint all_hobbies_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists all_hobbies_category_id_idx
  on public.all_hobbies (category_id);

create index if not exists all_hobbies_category_name_idx
  on public.all_hobbies (category_id, name);

drop trigger if exists set_hobby_category_updated_at on public.hobby_category;
create trigger set_hobby_category_updated_at
  before update on public.hobby_category
  for each row execute function public.set_updated_at();

drop trigger if exists set_all_hobbies_updated_at on public.all_hobbies;
create trigger set_all_hobbies_updated_at
  before update on public.all_hobbies
  for each row execute function public.set_updated_at();

insert into public.hobby_category (id, name, sort_order)
values
  (1, 'Sports & Fitness', 1),
  (2, 'Outdoor & Nature', 2),
  (3, 'Arts & Crafts', 3),
  (4, 'Music', 4),
  (5, 'Collecting', 5),
  (6, 'Games & Puzzles', 6),
  (7, 'Cooking & Food', 7),
  (8, 'Writing & Literature', 8),
  (9, 'Technology & Science', 9),
  (10, 'Performing Arts', 10),
  (11, 'Water Sports', 11),
  (12, 'Winter Sports', 12),
  (13, 'Animal & Pet Related', 13),
  (14, 'Travel & Exploration', 14),
  (15, 'DIY & Home', 15),
  (16, 'Social & Community', 16),
  (17, 'Mind & Body / Wellness', 17),
  (18, 'Photography & Visual', 18),
  (19, 'Automotive & Mechanical', 19),
  (20, 'Miscellaneous', 20)
on conflict (id) do nothing;

insert into public.all_hobbies (id, name, category_id)
values
  (1, 'Running', 1),
  (2, 'Sprinting', 1),
  (3, 'Marathon training', 1),
  (4, 'Trail running', 1),
  (5, 'Weightlifting', 1),
  (6, 'Powerlifting', 1),
  (7, 'Bodybuilding', 1),
  (8, 'CrossFit', 1),
  (9, 'Calisthenics', 1),
  (10, 'Yoga', 1),
  (11, 'Pilates', 1),
  (12, 'Zumba', 1),
  (13, 'Aerobics', 1),
  (14, 'Boxing', 1),
  (15, 'Kickboxing', 1),
  (16, 'Muay Thai', 1),
  (17, 'Wrestling', 1),
  (18, 'Judo', 1),
  (19, 'Karate', 1),
  (20, 'Taekwondo', 1),
  (21, 'Brazilian Jiu-Jitsu', 1),
  (22, 'Fencing', 1),
  (23, 'Archery', 1),
  (24, 'Tennis', 1),
  (25, 'Badminton', 1),
  (26, 'Table tennis', 1),
  (27, 'Squash', 1),
  (28, 'Racquetball', 1),
  (29, 'Pickleball', 1),
  (30, 'Basketball', 1),
  (31, 'Football (soccer)', 1),
  (32, 'American football', 1),
  (33, 'Rugby', 1),
  (34, 'Volleyball', 1),
  (35, 'Beach volleyball', 1),
  (36, 'Baseball', 1),
  (37, 'Softball', 1),
  (38, 'Cricket', 1),
  (39, 'Golf', 1),
  (40, 'Disc golf', 1),
  (41, 'Bowling', 1),
  (42, 'Handball', 1),
  (43, 'Lacrosse', 1),
  (44, 'Field hockey', 1),
  (45, 'Ice hockey', 1),
  (46, 'Roller hockey', 1),
  (47, 'Gymnastics', 1),
  (48, 'Rhythmic gymnastics', 1),
  (49, 'Cheerleading', 1),
  (50, 'Track and field', 1),
  (51, 'Triathlon', 1),
  (52, 'Duathlon', 1),
  (53, 'Cycling', 1),
  (54, 'Mountain biking', 1),
  (55, 'BMX', 1),
  (56, 'Road cycling', 1),
  (57, 'Spin classes', 1),
  (58, 'Parkour', 1),
  (59, 'Rock climbing', 1),
  (60, 'Bouldering', 1),
  (61, 'Ice climbing', 1),
  (62, 'Mountaineering', 1),
  (63, 'Hiking', 1),
  (64, 'Backpacking', 1),
  (65, 'Orienteering', 1),
  (66, 'Race walking', 1),
  (67, 'Obstacle course racing', 1),
  (68, 'Horseback riding', 1),
  (69, 'Polo', 1),
  (70, 'Equestrian jumping', 1),
  (71, 'Skateboarding', 1),
  (72, 'Longboarding', 1),
  (73, 'Roller skating', 1),
  (74, 'Inline skating', 1),
  (75, 'Ultimate frisbee', 1),
  (76, 'Kabaddi', 1),
  (77, 'Sepak takraw', 1),
  (78, 'Curling', 1),
  (79, 'Bocce ball', 1),
  (80, 'Croquet', 1),
  (81, 'Camping', 2),
  (82, 'Backpacking', 2),
  (83, 'Bird watching', 2),
  (84, 'Butterfly watching', 2),
  (85, 'Stargazing', 2),
  (86, 'Astronomy', 2),
  (87, 'Foraging', 2),
  (88, 'Mushroom hunting', 2),
  (89, 'Fishing', 2),
  (90, 'Fly fishing', 2),
  (91, 'Ice fishing', 2),
  (92, 'Spearfishing', 2),
  (93, 'Hunting', 2),
  (94, 'Bowhunting', 2),
  (95, 'Falconry', 2),
  (96, 'Beekeeping', 2),
  (97, 'Gardening', 2),
  (98, 'Vegetable gardening', 2),
  (99, 'Flower gardening', 2),
  (100, 'Bonsai growing', 2),
  (101, 'Terrarium building', 2),
  (102, 'Xeriscaping', 2),
  (103, 'Composting', 2),
  (104, 'Permaculture', 2),
  (105, 'Landscaping', 2),
  (106, 'Tree climbing', 2),
  (107, 'Geocaching', 2),
  (108, 'Metal detecting', 2),
  (109, 'Rock hounding', 2),
  (110, 'Fossil hunting', 2),
  (111, 'Caving/spelunking', 2),
  (112, 'Canyoneering', 2),
  (113, 'Kite flying', 2),
  (114, 'Kitesurfing', 2),
  (115, 'Paragliding', 2),
  (116, 'Hang gliding', 2),
  (117, 'Skydiving', 2),
  (118, 'BASE jumping', 2),
  (119, 'Hot air ballooning', 2),
  (120, 'Zip-lining', 2),
  (121, 'Snowshoeing', 2),
  (122, 'Sledding', 2),
  (123, 'Survivalism/bushcraft', 2),
  (124, 'Whittling', 2),
  (125, 'Nature photography', 2),
  (126, 'Wildlife tracking', 2),
  (127, 'Environmental volunteering', 2),
  (128, 'Beach cleaning', 2),
  (129, 'Tide pooling', 2),
  (130, 'Shell collecting', 2),
  (131, 'Sand castle building', 2),
  (132, 'Picnicking', 2),
  (133, 'RV/van life travel', 2),
  (134, 'Off-roading', 2),
  (135, 'ATV riding', 2),
  (136, 'Dirt biking', 2),
  (137, 'Overlanding', 2),
  (138, 'Volcano tourism', 2),
  (139, 'Glacier trekking', 2),
  (140, 'Desert exploration', 2),
  (141, 'Cave diving', 2),
  (142, 'Canoeing', 2),
  (143, 'Kayaking', 2),
  (144, 'Whitewater rafting', 2),
  (145, 'Stand-up paddleboarding', 2),
  (146, 'Sailing', 2),
  (147, 'Yachting', 2),
  (148, 'Windsurfing', 2),
  (149, 'Surfing', 2),
  (150, 'Bodyboarding', 2),
  (151, 'Snorkeling', 2),
  (152, 'Scuba diving', 2),
  (153, 'Free diving', 2),
  (154, 'Wakeboarding', 2),
  (155, 'Water skiing', 2),
  (156, 'Jet skiing', 2),
  (157, 'Rowing', 2),
  (158, 'Dragon boat racing', 2),
  (159, 'Fishing kayaking', 2),
  (160, 'Nature journaling', 2),
  (161, 'Painting', 3),
  (162, 'Watercolor painting', 3),
  (163, 'Oil painting', 3),
  (164, 'Acrylic painting', 3),
  (165, 'Sketching', 3),
  (166, 'Drawing', 3),
  (167, 'Charcoal drawing', 3),
  (168, 'Pastel art', 3),
  (169, 'Calligraphy', 3),
  (170, 'Hand lettering', 3),
  (171, 'Illustration', 3),
  (172, 'Cartooning', 3),
  (173, 'Comic drawing', 3),
  (174, 'Doodling', 3),
  (175, 'Sculpting', 3),
  (176, 'Clay modeling', 3),
  (177, 'Pottery', 3),
  (178, 'Ceramics', 3),
  (179, 'Wheel throwing', 3),
  (180, 'Woodcarving', 3),
  (181, 'Wood burning (pyrography)', 3),
  (182, 'Whittling', 3),
  (183, 'Furniture making', 3),
  (184, 'Woodworking', 3),
  (185, 'Carpentry', 3),
  (186, 'Metalworking', 3),
  (187, 'Blacksmithing', 3),
  (188, 'Welding', 3),
  (189, 'Jewelry making', 3),
  (190, 'Beading', 3),
  (191, 'Wire wrapping', 3),
  (192, 'Leatherworking', 3),
  (193, 'Leathercraft', 3),
  (194, 'Sewing', 3),
  (195, 'Quilting', 3),
  (196, 'Embroidery', 3),
  (197, 'Cross-stitch', 3),
  (198, 'Knitting', 3),
  (199, 'Crocheting', 3),
  (200, 'Macrame', 3),
  (201, 'Weaving', 3),
  (202, 'Tapestry making', 3),
  (203, 'Spinning yarn', 3),
  (204, 'Felting', 3),
  (205, 'Needle felting', 3),
  (206, 'Dressmaking', 3),
  (207, 'Costume design', 3),
  (208, 'Fashion design', 3),
  (209, 'Origami', 3),
  (210, 'Paper quilling', 3),
  (211, 'Scrapbooking', 3),
  (212, 'Card making', 3),
  (213, 'Collage', 3),
  (214, 'Decoupage', 3),
  (215, 'Mosaic art', 3),
  (216, 'Stained glass making', 3),
  (217, 'Glass blowing', 3),
  (218, 'Candle making', 3),
  (219, 'Soap making', 3),
  (220, 'Perfume making', 3),
  (221, 'Resin art', 3),
  (222, 'Printmaking', 3),
  (223, 'Block printing', 3),
  (224, 'Screen printing', 3),
  (225, 'Etching', 3),
  (226, 'Lithography', 3),
  (227, 'Batik', 3),
  (228, 'Tie-dye', 3),
  (229, 'Fabric dyeing', 3),
  (230, 'Upholstery', 3),
  (231, 'Basket weaving', 3),
  (232, 'Chair caning', 3),
  (233, 'Rug making', 3),
  (234, 'Tufting', 3),
  (235, 'Stone carving', 3),
  (236, 'Sand sculpting', 3),
  (237, 'Ice sculpting', 3),
  (238, 'Balloon twisting', 3),
  (239, 'Face painting', 3),
  (240, 'Airbrushing', 3),
  (241, 'Graffiti art', 3),
  (242, 'Street art', 3),
  (243, 'Mural painting', 3),
  (244, 'Digital art', 3),
  (245, 'Digital illustration', 3),
  (246, 'Vector art', 3),
  (247, 'Pixel art', 3),
  (248, '3D modeling', 3),
  (249, 'Diorama building', 3),
  (250, 'Model building', 3),
  (251, 'Model railroading', 3),
  (252, 'Miniature painting', 3),
  (253, 'Dollhouse building', 3),
  (254, 'Puppet making', 3),
  (255, 'Mask making', 3),
  (256, 'Taxidermy', 3),
  (257, 'Flower pressing', 3),
  (258, 'Herbarium making', 3),
  (259, 'Kite making', 3),
  (260, 'Paper mache', 3),
  (261, 'Playing guitar', 4),
  (262, 'Playing bass guitar', 4),
  (263, 'Playing piano', 4),
  (264, 'Playing keyboard', 4),
  (265, 'Playing drums', 4),
  (266, 'Playing violin', 4),
  (267, 'Playing cello', 4),
  (268, 'Playing viola', 4),
  (269, 'Playing double bass', 4),
  (270, 'Playing flute', 4),
  (271, 'Playing clarinet', 4),
  (272, 'Playing saxophone', 4),
  (273, 'Playing trumpet', 4),
  (274, 'Playing trombone', 4),
  (275, 'Playing tuba', 4),
  (276, 'Playing French horn', 4),
  (277, 'Playing harmonica', 4),
  (278, 'Playing accordion', 4),
  (279, 'Playing banjo', 4),
  (280, 'Playing mandolin', 4),
  (281, 'Playing ukulele', 4),
  (282, 'Playing harp', 4),
  (283, 'Playing bagpipes', 4),
  (284, 'Playing sitar', 4),
  (285, 'Playing djembe', 4),
  (286, 'Playing tabla', 4),
  (287, 'Playing bongos', 4),
  (288, 'Playing congas', 4),
  (289, 'Beatboxing', 4),
  (290, 'Singing', 4),
  (291, 'Choir singing', 4),
  (292, 'Opera singing', 4),
  (293, 'Vocal training', 4),
  (294, 'Songwriting', 4),
  (295, 'Music composition', 4),
  (296, 'Music production', 4),
  (297, 'Beat making', 4),
  (298, 'DJing', 4),
  (299, 'Turntablism', 4),
  (300, 'Music theory study', 4),
  (301, 'Sight reading', 4),
  (302, 'Ear training', 4),
  (303, 'Karaoke', 4),
  (304, 'Marching band', 4),
  (305, 'Orchestra playing', 4),
  (306, 'Chamber music', 4),
  (307, 'Jazz improvisation', 4),
  (308, 'Rapping', 4),
  (309, 'Freestyle rap', 4),
  (310, 'A cappella singing', 4),
  (311, 'Barbershop quartet singing', 4),
  (312, 'Yodeling', 4),
  (313, 'Whistling', 4),
  (314, 'Music transcription', 4),
  (315, 'Instrument building', 4),
  (316, 'Instrument repair', 4),
  (317, 'Vinyl record collecting', 4),
  (318, 'Podcasting about music', 4),
  (319, 'Concert going', 4),
  (320, 'Music journaling', 4),
  (321, 'Stamp collecting', 5),
  (322, 'Coin collecting', 5),
  (323, 'Currency collecting', 5),
  (324, 'Postcard collecting', 5),
  (325, 'Antique collecting', 5),
  (326, 'Vintage toy collecting', 5),
  (327, 'Action figure collecting', 5),
  (328, 'Doll collecting', 5),
  (329, 'Comic book collecting', 5),
  (330, 'Trading card collecting', 5),
  (331, 'Sports card collecting', 5),
  (332, 'Pokemon card collecting', 5),
  (333, 'Vinyl record collecting', 5),
  (334, 'Book collecting', 5),
  (335, 'Rare book collecting', 5),
  (336, 'Autograph collecting', 5),
  (337, 'Sports memorabilia collecting', 5),
  (338, 'Movie memorabilia collecting', 5),
  (339, 'Music memorabilia collecting', 5),
  (340, 'Watch collecting', 5),
  (341, 'Pen collecting', 5),
  (342, 'Fountain pen collecting', 5),
  (343, 'Button collecting', 5),
  (344, 'Pin collecting', 5),
  (345, 'Patch collecting', 5),
  (346, 'Keychain collecting', 5),
  (347, 'Magnet collecting', 5),
  (348, 'Snow globe collecting', 5),
  (349, 'Shot glass collecting', 5),
  (350, 'Bottle collecting', 5),
  (351, 'Wine collecting', 5),
  (352, 'Whiskey collecting', 5),
  (353, 'Beer can collecting', 5),
  (354, 'Bottle cap collecting', 5),
  (355, 'Rock and mineral collecting', 5),
  (356, 'Gemstone collecting', 5),
  (357, 'Shell collecting', 5),
  (358, 'Fossil collecting', 5),
  (359, 'Insect collecting', 5),
  (360, 'Butterfly collecting', 5),
  (361, 'Taxidermy collecting', 5),
  (362, 'Antique furniture collecting', 5),
  (363, 'Clock collecting', 5),
  (364, 'Typewriter collecting', 5),
  (365, 'Camera collecting', 5),
  (366, 'Vintage camera collecting', 5),
  (367, 'Radio collecting', 5),
  (368, 'Vintage electronics collecting', 5),
  (369, 'Model car collecting', 5),
  (370, 'Model train collecting', 5),
  (371, 'Model airplane collecting', 5),
  (372, 'Lego collecting', 5),
  (373, 'Vintage clothing collecting', 5),
  (374, 'Hat collecting', 5),
  (375, 'Shoe collecting', 5),
  (376, 'Sneaker collecting', 5),
  (377, 'Handbag collecting', 5),
  (378, 'Jewelry collecting', 5),
  (379, 'Antique jewelry collecting', 5),
  (380, 'Militaria collecting', 5),
  (381, 'War memorabilia collecting', 5),
  (382, 'Political memorabilia collecting', 5),
  (383, 'Flag collecting', 5),
  (384, 'Map collecting', 5),
  (385, 'Globe collecting', 5),
  (386, 'Postage meter collecting', 5),
  (387, 'Matchbook collecting', 5),
  (388, 'Playing card collecting', 5),
  (389, 'Board game collecting', 5),
  (390, 'Video game collecting', 5),
  (391, 'Retro console collecting', 5),
  (392, 'Vintage poster collecting', 5),
  (393, 'Art print collecting', 5),
  (394, 'Sculpture collecting', 5),
  (395, 'Tea set collecting', 5),
  (396, 'Teapot collecting', 5),
  (397, 'Cookbook collecting', 5),
  (398, 'Recipe card collecting', 5),
  (399, 'Perfume bottle collecting', 5),
  (400, 'Antique tool collecting', 5),
  (401, 'Chess', 6),
  (402, 'Checkers', 6),
  (403, 'Go (board game)', 6),
  (404, 'Backgammon', 6),
  (405, 'Mahjong', 6),
  (406, 'Poker', 6),
  (407, 'Bridge (card game)', 6),
  (408, 'Rummy', 6),
  (409, 'Solitaire', 6),
  (410, 'Blackjack', 6),
  (411, 'Board gaming', 6),
  (412, 'Dungeons & Dragons', 6),
  (413, 'Tabletop role-playing games', 6),
  (414, 'Warhammer/wargaming', 6),
  (415, 'Dice games', 6),
  (416, 'Trivia gaming', 6),
  (417, 'Escape rooms', 6),
  (418, 'Jigsaw puzzles', 6),
  (419, 'Crossword puzzles', 6),
  (420, 'Sudoku', 6),
  (421, 'Word searches', 6),
  (422, 'Rubik''s Cube solving', 6),
  (423, 'Logic puzzles', 6),
  (424, 'Riddles', 6),
  (425, 'Video gaming', 6),
  (426, 'PC gaming', 6),
  (427, 'Console gaming', 6),
  (428, 'Mobile gaming', 6),
  (429, 'Retro gaming', 6),
  (430, 'Speedrunning', 6),
  (431, 'Esports', 6),
  (432, 'Streaming (Twitch)', 6),
  (433, 'Fantasy sports', 6),
  (434, 'Sports betting analysis', 6),
  (435, 'Magic: The Gathering', 6),
  (436, 'Yu-Gi-Oh! playing', 6),
  (437, 'Charades', 6),
  (438, 'Pictionary', 6),
  (439, 'Trivial Pursuit', 6),
  (440, 'Scrabble', 6),
  (441, 'Bingo', 6),
  (442, 'Darts', 6),
  (443, 'Foosball', 6),
  (444, 'Air hockey', 6),
  (445, 'Billiards/pool', 6),
  (446, 'Snooker', 6),
  (447, 'Ping pong', 6),
  (448, 'Cornhole', 6),
  (449, 'Horseshoes', 6),
  (450, 'Ludo', 6),
  (451, 'Dominoes', 6),
  (452, 'Tarot card reading', 6),
  (453, 'Fantasy football', 6),
  (454, 'Live action role-play (LARP)', 6),
  (455, 'Cosplay', 6),
  (456, 'Murder mystery gaming', 6),
  (457, 'Strategy gaming', 6),
  (458, 'Kubb', 6),
  (459, 'Jenga/tower games', 6),
  (460, 'Mind mapping puzzles', 6),
  (461, 'Cooking', 7),
  (462, 'Baking', 7),
  (463, 'Bread making', 7),
  (464, 'Sourdough baking', 7),
  (465, 'Cake decorating', 7),
  (466, 'Pastry making', 7),
  (467, 'Candy making', 7),
  (468, 'Chocolate making', 7),
  (469, 'Cheese making', 7),
  (470, 'Fermenting foods', 7),
  (471, 'Pickling', 7),
  (472, 'Canning/preserving', 7),
  (473, 'Jam making', 7),
  (474, 'Wine making', 7),
  (475, 'Beer brewing', 7),
  (476, 'Cider making', 7),
  (477, 'Kombucha brewing', 7),
  (478, 'Coffee roasting', 7),
  (479, 'Barista skills/latte art', 7),
  (480, 'Mixology/cocktail making', 7),
  (481, 'Grilling/BBQ', 7),
  (482, 'Smoking meats', 7),
  (483, 'Sushi making', 7),
  (484, 'Pasta making', 7),
  (485, 'Pizza making', 7),
  (486, 'Food photography', 7),
  (487, 'Food blogging', 7),
  (488, 'Recipe development', 7),
  (489, 'Meal prepping', 7),
  (490, 'Vegan cooking', 7),
  (491, 'International cuisine exploration', 7),
  (492, 'Molecular gastronomy', 7),
  (493, 'Cake baking competitions', 7),
  (494, 'Ice cream making', 7),
  (495, 'Charcuterie board making', 7),
  (496, 'Tea ceremony', 7),
  (497, 'Wine tasting', 7),
  (498, 'Beer tasting', 7),
  (499, 'Whiskey tasting', 7),
  (500, 'Cheese tasting', 7),
  (501, 'Olive oil tasting', 7),
  (502, 'Chocolate tasting', 7),
  (503, 'Food styling', 7),
  (504, 'Butchery', 7),
  (505, 'Foraging for wild food', 7),
  (506, 'Herb growing for cooking', 7),
  (507, 'Spice blending', 7),
  (508, 'Hot sauce making', 7),
  (509, 'Vinegar making', 7),
  (510, 'Cake pop making', 7),
  (511, 'Cupcake decorating', 7),
  (512, 'Sugar art/pulled sugar', 7),
  (513, 'Bartending', 7),
  (514, 'Home distilling', 7),
  (515, 'Pretzel making', 7),
  (516, 'Donut making', 7),
  (517, 'Dumpling making', 7),
  (518, 'Ramen making', 7),
  (519, 'Kimchi making', 7),
  (520, 'Nutrition experimentation', 7),
  (521, 'Creative writing', 8),
  (522, 'Fiction writing', 8),
  (523, 'Poetry writing', 8),
  (524, 'Short story writing', 8),
  (525, 'Novel writing', 8),
  (526, 'Screenwriting', 8),
  (527, 'Playwriting', 8),
  (528, 'Songwriting (lyrics)', 8),
  (529, 'Journaling', 8),
  (530, 'Diary keeping', 8),
  (531, 'Blogging', 8),
  (532, 'Travel writing', 8),
  (533, 'Memoir writing', 8),
  (534, 'Biography writing', 8),
  (535, 'Technical writing', 8),
  (536, 'Copywriting', 8),
  (537, 'Fan fiction writing', 8),
  (538, 'Reading', 8),
  (539, 'Book clubs', 8),
  (540, 'Speed reading', 8),
  (541, 'Literary analysis', 8),
  (542, 'Book reviewing', 8),
  (543, 'Editing/proofreading', 8),
  (544, 'Publishing zines', 8),
  (545, 'Letter writing', 8),
  (546, 'Pen pal correspondence', 8),
  (547, 'Handwriting practice', 8),
  (548, 'Calligraphy writing', 8),
  (549, 'Storytelling', 8),
  (550, 'Spoken word performance', 8),
  (551, 'Slam poetry', 8),
  (552, 'Haiku writing', 8),
  (553, 'Limerick writing', 8),
  (554, 'Riddle writing', 8),
  (555, 'Joke writing/comedy writing', 8),
  (556, 'Translation', 8),
  (557, 'Linguistics study', 8),
  (558, 'Etymology study', 8),
  (559, 'Language learning', 8),
  (560, 'Constructed language creation', 8),
  (561, 'Coding/programming', 9),
  (562, 'Web development', 9),
  (563, 'App development', 9),
  (564, 'Game development', 9),
  (565, 'Robotics', 9),
  (566, 'Electronics tinkering', 9),
  (567, 'Circuit building', 9),
  (568, 'Arduino projects', 9),
  (569, 'Raspberry Pi projects', 9),
  (570, '3D printing', 9),
  (571, 'CAD design', 9),
  (572, 'Drone flying', 9),
  (573, 'Drone racing', 9),
  (574, 'Ham radio operating', 9),
  (575, 'Amateur radio', 9),
  (576, 'Computer building (PC building)', 9),
  (577, 'Computer repair', 9),
  (578, 'Hacking (ethical/CTF)', 9),
  (579, 'Cryptography', 9),
  (580, 'Cybersecurity research', 9),
  (581, 'AI/machine learning projects', 9),
  (582, 'Data science projects', 9),
  (583, 'Blockchain exploration', 9),
  (584, 'Cryptocurrency trading', 9),
  (585, 'Stock trading/investing', 9),
  (586, 'Astrophysics study', 9),
  (587, 'Astronomy observation', 9),
  (588, 'Telescope making', 9),
  (589, 'Chemistry experiments', 9),
  (590, 'Home lab science', 9),
  (591, 'Biology/microscopy', 9),
  (592, 'Genealogy research', 9),
  (593, 'Genetics study', 9),
  (594, 'Meteorology/weather tracking', 9),
  (595, 'Storm chasing', 9),
  (596, 'Seismology tracking', 9),
  (597, 'Geology study', 9),
  (598, 'Paleontology', 9),
  (599, 'Archaeology (amateur)', 9),
  (600, 'Podcasting', 9),
  (601, 'Video editing', 9),
  (602, 'YouTube content creation', 9),
  (603, 'Vlogging', 9),
  (604, 'Animation', 9),
  (605, 'Stop-motion animation', 9),
  (606, 'Graphic design', 9),
  (607, 'UX/UI design', 9),
  (608, 'Virtual reality exploration', 9),
  (609, 'Augmented reality projects', 9),
  (610, 'Home automation/smart home projects', 9),
  (611, 'Solar power projects', 9),
  (612, 'Wind turbine building', 9),
  (613, 'Battery/electric vehicle tinkering', 9),
  (614, 'Rocketry (model rockets)', 9),
  (615, 'Aeromodeling', 9),
  (616, 'Radio-controlled cars', 9),
  (617, 'Radio-controlled planes', 9),
  (618, 'Radio-controlled boats', 9),
  (619, 'Satellite tracking', 9),
  (620, 'Software modding', 9),
  (621, 'Acting', 10),
  (622, 'Theater performance', 10),
  (623, 'Improv comedy', 10),
  (624, 'Stand-up comedy', 10),
  (625, 'Dancing', 10),
  (626, 'Ballet', 10),
  (627, 'Ballroom dancing', 10),
  (628, 'Salsa dancing', 10),
  (629, 'Tango dancing', 10),
  (630, 'Swing dancing', 10),
  (631, 'Hip hop dancing', 10),
  (632, 'Contemporary dance', 10),
  (633, 'Tap dancing', 10),
  (634, 'Belly dancing', 10),
  (635, 'Line dancing', 10),
  (636, 'Folk dancing', 10),
  (637, 'Breakdancing', 10),
  (638, 'Pole dancing', 10),
  (639, 'Aerial silks/aerial arts', 10),
  (640, 'Circus arts', 10),
  (641, 'Juggling', 10),
  (642, 'Unicycling', 10),
  (643, 'Magic tricks/magic performance', 10),
  (644, 'Ventriloquism', 10),
  (645, 'Puppetry performance', 10),
  (646, 'Clowning', 10),
  (647, 'Mime', 10),
  (648, 'Fire spinning', 10),
  (649, 'Fire breathing', 10),
  (650, 'Baton twirling', 10),
  (651, 'Twirling/flow arts', 10),
  (652, 'Hooping (hula hoop dance)', 10),
  (653, 'Yo-yo tricks', 10),
  (654, 'Beatboxing performance', 10),
  (655, 'Voice acting', 10),
  (656, 'Film making', 10),
  (657, 'Short film production', 10),
  (658, 'Community theater', 10),
  (659, 'Musical theater', 10),
  (660, 'Drag performance', 10),
  (661, 'Swimming', 11),
  (662, 'Open water swimming', 11),
  (663, 'Synchronized swimming', 11),
  (664, 'Diving (platform/springboard)', 11),
  (665, 'Underwater photography', 11),
  (666, 'Underwater hockey', 11),
  (667, 'Water polo', 11),
  (668, 'Competitive sailing', 11),
  (669, 'Dinghy sailing', 11),
  (670, 'Catamaran sailing', 11),
  (671, 'Windsurfing', 11),
  (672, 'Kitesurfing', 11),
  (673, 'Wakesurfing', 11),
  (674, 'Flyboarding', 11),
  (675, 'River tubing', 11),
  (676, 'Canyoning', 11),
  (677, 'Freediving', 11),
  (678, 'Spearfishing', 11),
  (679, 'Boat building', 11),
  (680, 'Model boat sailing', 11),
  (681, 'Rowing (crew)', 11),
  (682, 'Outrigger canoeing', 11),
  (683, 'Ice swimming', 11),
  (684, 'Paddleboard yoga', 11),
  (685, 'Coasteering', 11),
  (686, 'Bodysurfing', 11),
  (687, 'Longboard surfing', 11),
  (688, 'Skimboarding', 11),
  (689, 'River rafting', 11),
  (690, 'Deep sea fishing', 11),
  (691, 'Skiing', 12),
  (692, 'Downhill skiing', 12),
  (693, 'Cross-country skiing', 12),
  (694, 'Freestyle skiing', 12),
  (695, 'Ski jumping', 12),
  (696, 'Snowboarding', 12),
  (697, 'Ice skating', 12),
  (698, 'Figure skating', 12),
  (699, 'Speed skating', 12),
  (700, 'Ice hockey', 12),
  (701, 'Bobsledding', 12),
  (702, 'Luge', 12),
  (703, 'Skeleton (sledding sport)', 12),
  (704, 'Curling', 12),
  (705, 'Snowmobiling', 12),
  (706, 'Ice climbing', 12),
  (707, 'Winter camping', 12),
  (708, 'Building igloos', 12),
  (709, 'Snow sculpting', 12),
  (710, 'Snowball fight organizing', 12),
  (711, 'Biathlon', 12),
  (712, 'Ski touring', 12),
  (713, 'Backcountry skiing', 12),
  (714, 'Snowkiting', 12),
  (715, 'Ice fishing', 12),
  (716, 'Dog sledding', 12),
  (717, 'Cross-country snowshoeing', 12),
  (718, 'Winter photography', 12),
  (719, 'Ice sculpting', 12),
  (720, 'Sled dog racing', 12),
  (721, 'Dog training', 13),
  (722, 'Dog agility training', 13),
  (723, 'Dog showing', 13),
  (724, 'Cat breeding', 13),
  (725, 'Horseback riding', 13),
  (726, 'Horse training', 13),
  (727, 'Falconry', 13),
  (728, 'Beekeeping', 13),
  (729, 'Aquarium keeping', 13),
  (730, 'Fish breeding', 13),
  (731, 'Reptile keeping', 13),
  (732, 'Bird keeping/aviculture', 13),
  (733, 'Chicken raising/backyard poultry', 13),
  (734, 'Pigeon racing', 13),
  (735, 'Rabbit breeding', 13),
  (736, 'Animal rescue volunteering', 13),
  (737, 'Wildlife rehabilitation', 13),
  (738, 'Pet grooming', 13),
  (739, 'Dog walking', 13),
  (740, 'Farm animal husbandry', 13),
  (741, 'Beekeeping for honey', 13),
  (742, 'Silkworm raising', 13),
  (743, 'Ant farming', 13),
  (744, 'Herpetology (studying reptiles/amphibians)', 13),
  (745, 'Entomology (insect study)', 13),
  (746, 'Ornithology (bird study)', 13),
  (747, 'Dog sledding', 13),
  (748, 'Equine therapy volunteering', 13),
  (749, 'Zoo volunteering', 13),
  (750, 'Wildlife photography', 13),
  (751, 'Traveling', 14),
  (752, 'Backpacking abroad', 14),
  (753, 'Road tripping', 14),
  (754, 'Van life', 14),
  (755, 'RVing', 14),
  (756, 'Cruise travel', 14),
  (757, 'Solo travel', 14),
  (758, 'Adventure travel', 14),
  (759, 'Cultural tourism', 14),
  (760, 'Historical site visiting', 14),
  (761, 'National park visiting', 14),
  (762, 'World heritage site collecting', 14),
  (763, 'Passport stamp collecting', 14),
  (764, 'Language immersion travel', 14),
  (765, 'Culinary tourism', 14),
  (766, 'Volunteer tourism', 14),
  (767, 'Ecotourism', 14),
  (768, 'Extreme tourism', 14),
  (769, 'City exploration/urban exploring', 14),
  (770, 'Abandoned building exploring', 14),
  (771, 'Ghost town visiting', 14),
  (772, 'Museum visiting', 14),
  (773, 'Historical reenactment', 14),
  (774, 'Genealogy travel', 14),
  (775, 'Pilgrimage travel', 14),
  (776, 'Slow travel', 14),
  (777, 'Digital nomad lifestyle', 14),
  (778, 'Couchsurfing/hosting travelers', 14),
  (779, 'Travel photography', 14),
  (780, 'Travel blogging/vlogging', 14),
  (781, 'Home renovation', 15),
  (782, 'Furniture restoration', 15),
  (783, 'Upcycling furniture', 15),
  (784, 'Interior design', 15),
  (785, 'Home staging', 15),
  (786, 'DIY electronics repair', 15),
  (787, 'Appliance repair', 15),
  (788, 'Car restoration', 15),
  (789, 'Car detailing', 15),
  (790, 'Motorcycle restoration', 15),
  (791, 'Bicycle repair/maintenance', 15),
  (792, 'Clock repair', 15),
  (793, 'Watch repair', 15),
  (794, 'Shoe repair/cobbling', 15),
  (795, 'Sewing machine repair', 15),
  (796, 'Book binding/restoration', 15),
  (797, 'Antique restoration', 15),
  (798, 'Painting rooms/houses', 15),
  (799, 'Wallpapering', 15),
  (800, 'Tiling', 15),
  (801, 'Plumbing DIY', 15),
  (802, 'Electrical DIY', 15),
  (803, 'Deck building', 15),
  (804, 'Fence building', 15),
  (805, 'Shed building', 15),
  (806, 'Treehouse building', 15),
  (807, 'Greenhouse building', 15),
  (808, 'Aquascaping', 15),
  (809, 'Terrarium building', 15),
  (810, 'Vertical gardening', 15),
  (811, 'Hydroponics', 15),
  (812, 'Composting', 15),
  (813, 'Rain barrel/water collection systems', 15),
  (814, 'Solar panel installation (DIY)', 15),
  (815, 'Home brewing setup building', 15),
  (816, 'Workshop organizing', 15),
  (817, 'Tool restoration', 15),
  (818, 'Knife making/sharpening', 15),
  (819, 'Blacksmithing', 15),
  (820, 'Chainsaw carving', 15),
  (821, 'Volunteering', 16),
  (822, 'Community organizing', 16),
  (823, 'Mentoring', 16),
  (824, 'Tutoring', 16),
  (825, 'Coaching youth sports', 16),
  (826, 'Public speaking', 16),
  (827, 'Debate club participation', 16),
  (828, 'Toastmasters', 16),
  (829, 'Book club organizing', 16),
  (830, 'Supper club hosting', 16),
  (831, 'Wine club participation', 16),
  (832, 'Board game night hosting', 16),
  (833, 'Trivia night hosting', 16),
  (834, 'Fundraising event organizing', 16),
  (835, 'Church/religious group activities', 16),
  (836, 'Historical society participation', 16),
  (837, 'Genealogy society participation', 16),
  (838, 'Political activism/campaigning', 16),
  (839, 'Environmental activism', 16),
  (840, 'Animal welfare advocacy', 16),
  (841, 'Charity work', 16),
  (842, 'Blood donation drives organizing', 16),
  (843, 'Soup kitchen volunteering', 16),
  (844, 'Habitat for Humanity building', 16),
  (845, 'Peace corps/international volunteering', 16),
  (846, 'Neighborhood watch participation', 16),
  (847, 'Local history preservation', 16),
  (848, 'Museum docent work', 16),
  (849, 'Park ranger volunteering', 16),
  (850, 'Community garden participation', 16),
  (851, 'Meditation', 17),
  (852, 'Mindfulness practice', 17),
  (853, 'Breathwork', 17),
  (854, 'Tai chi', 17),
  (855, 'Qigong', 17),
  (856, 'Reiki practice', 17),
  (857, 'Aromatherapy', 17),
  (858, 'Journaling for wellness', 17),
  (859, 'Gratitude journaling', 17),
  (860, 'Vision boarding', 17),
  (861, 'Life coaching study', 17),
  (862, 'Astrology study', 17),
  (863, 'Numerology', 17),
  (864, 'Tarot reading', 17),
  (865, 'Crystal healing study', 17),
  (866, 'Sound bath/sound healing', 17),
  (867, 'Ecotherapy/forest bathing', 17),
  (868, 'Cold plunge/ice bathing', 17),
  (869, 'Sauna rituals', 17),
  (870, 'Fasting practices', 17),
  (871, 'Nutrition tracking', 17),
  (872, 'Home spa treatments', 17),
  (873, 'Massage therapy practice', 17),
  (874, 'Reflexology', 17),
  (875, 'Acupressure', 17),
  (876, 'Feng shui study', 17),
  (877, 'Minimalism practice', 17),
  (878, 'Decluttering/organizing', 17),
  (879, 'Sleep optimization hobbies', 17),
  (880, 'Biohacking', 17),
  (881, 'Photography', 18),
  (882, 'Portrait photography', 18),
  (883, 'Landscape photography', 18),
  (884, 'Macro photography', 18),
  (885, 'Street photography', 18),
  (886, 'Astrophotography', 18),
  (887, 'Wildlife photography', 18),
  (888, 'Film photography', 18),
  (889, 'Darkroom developing', 18),
  (890, 'Drone photography', 18),
  (891, 'Photo editing', 18),
  (892, 'Photo restoration', 18),
  (893, 'Videography', 18),
  (894, 'Cinematography', 18),
  (895, 'Time-lapse photography', 18),
  (896, 'Light painting photography', 18),
  (897, 'Pinhole photography', 18),
  (898, 'Instant/Polaroid photography', 18),
  (899, 'Photo album making', 18),
  (900, 'Scrapbooking with photos', 18),
  (901, 'Car customization', 19),
  (902, 'Car racing (amateur)', 19),
  (903, 'Go-kart racing', 19),
  (904, 'Drag racing', 19),
  (905, 'Off-road racing', 19),
  (906, 'Rallying', 19),
  (907, 'Autocross', 19),
  (908, 'Motorcycle riding', 19),
  (909, 'Motorcycle touring', 19),
  (910, 'Classic car restoration', 19),
  (911, 'Engine building', 19),
  (912, 'Custom motorcycle building', 19),
  (913, 'Car audio system building', 19),
  (914, 'Model car building', 19),
  (915, 'Slot car racing', 19),
  (916, 'RC car racing', 19),
  (917, 'Car detailing/showing', 19),
  (918, 'Tractor pulling', 19),
  (919, 'Monster truck enthusiasm', 19),
  (920, 'Vintage moped restoration', 19),
  (921, 'Bicycle building/frame building', 19),
  (922, 'E-bike building', 19),
  (923, 'Kart building', 19),
  (924, 'Airplane piloting (recreational)', 19),
  (925, 'Gliding/soaring', 19),
  (926, 'Hot rod building', 19),
  (927, 'Truck customization', 19),
  (928, 'Snowmobile racing', 19),
  (929, 'Jet ski racing', 19),
  (930, 'Boat restoration', 19),
  (931, 'Genealogy/family tree research', 20),
  (932, 'Scrapbooking family history', 20),
  (933, 'Letterboxing', 20),
  (934, 'Urban sketching', 20),
  (935, 'Vexillology (flag study)', 20),
  (936, 'Philately (stamp study)', 20),
  (937, 'Numismatics (coin study)', 20),
  (938, 'Cartophily (map collecting/study)', 20),
  (939, 'Horology (watch/clock study)', 20),
  (940, 'Sommelier training', 20),
  (941, 'Cigar collecting/smoking', 20),
  (942, 'Pipe collecting', 20),
  (943, 'Perfumery', 20),
  (944, 'Candle scent blending', 20),
  (945, 'Soap crafting', 20),
  (946, 'Bath bomb making', 20),
  (947, 'Home organization consulting', 20),
  (948, 'Feng shui consulting', 20),
  (949, 'Personal styling', 20),
  (950, 'Thrift shopping/flipping', 20),
  (951, 'Reselling vintage items', 20),
  (952, 'Antiquing', 20),
  (953, 'Flea market hunting', 20),
  (954, 'Estate sale hunting', 20),
  (955, 'Yard sale hosting', 20),
  (956, 'Minimalist living challenges', 20),
  (957, 'Zero-waste living', 20),
  (958, 'Sustainable living practices', 20),
  (959, 'Off-grid living', 20),
  (960, 'Homesteading', 20),
  (961, 'Self-sufficiency farming', 20),
  (962, 'Canning and preserving', 20),
  (963, 'Root cellaring', 20),
  (964, 'Seed saving', 20),
  (965, 'Permaculture design', 20),
  (966, 'Aquaponics', 20),
  (967, 'Vermicomposting (worm farming)', 20),
  (968, 'Mushroom cultivation', 20),
  (969, 'Microgreens growing', 20),
  (970, 'Hot pepper growing', 20),
  (971, 'Bonsai cultivation', 20),
  (972, 'Ikebana (flower arranging)', 20),
  (973, 'Topiary art', 20),
  (974, 'Lawn care/landscaping art', 20),
  (975, 'Crop circle art (novelty)', 20),
  (976, 'Sand art', 20),
  (977, 'Chalk art', 20),
  (978, 'Henna art', 20),
  (979, 'Body painting', 20),
  (980, 'Tattoo design (drawing)', 20),
  (981, 'Nail art', 20),
  (982, 'Hairstyling practice', 20),
  (983, 'Makeup artistry', 20),
  (984, 'Cosplay costume making', 20),
  (985, 'Historical costume recreation', 20),
  (986, 'Renaissance fair participation', 20),
  (987, 'Medieval reenactment', 20),
  (988, 'Civil War reenactment', 20),
  (989, 'Viking reenactment', 20),
  (990, 'Steampunk crafting', 20),
  (991, 'Sci-fi convention attending', 20),
  (992, 'Anime conventions/fandom', 20),
  (993, 'Fan art creation', 20),
  (994, 'Fanzine making', 20),
  (995, 'Podcasting (general)', 20),
  (996, 'ASMR content creation', 20),
  (997, 'Life hacking/productivity systems', 20),
  (998, 'Bullet journaling', 20),
  (999, 'Habit tracking', 20),
  (1000, 'Time capsule making', 20)
on conflict (id) do nothing;

alter table public.hobby_category enable row level security;
alter table public.all_hobbies enable row level security;

drop policy if exists "hobby_category_select_authenticated" on public.hobby_category;
create policy "hobby_category_select_authenticated"
  on public.hobby_category for select
  to authenticated
  using (true);

drop policy if exists "all_hobbies_select_authenticated" on public.all_hobbies;
create policy "all_hobbies_select_authenticated"
  on public.all_hobbies for select
  to authenticated
  using (true);

grant select on table public.hobby_category to authenticated;
grant select on table public.all_hobbies to authenticated;
-- Spec 23: post hobby tags, tag-scoped feed, tag-aware search

-- ---------------------------------------------------------------------------
-- post_hobby_tags
-- ---------------------------------------------------------------------------

create table if not exists public.post_hobby_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  hobby_id integer references public.all_hobbies (id) on delete set null,
  name text not null,
  source text not null check (source in ('catalog', 'custom')),
  created_at timestamptz not null default now(),
  constraint post_hobby_tags_name_len check (
    char_length(trim(name)) between 1 and 80
  ),
  constraint post_hobby_tags_catalog_id check (
    (source = 'catalog' and hobby_id is not null)
    or (source = 'custom' and hobby_id is null)
  )
);

create unique index if not exists post_hobby_tags_post_hobby_id_uidx
  on public.post_hobby_tags (post_id, hobby_id)
  where hobby_id is not null;

create unique index if not exists post_hobby_tags_post_name_uidx
  on public.post_hobby_tags (post_id, lower(name));

create index if not exists post_hobby_tags_hobby_id_idx
  on public.post_hobby_tags (hobby_id)
  where hobby_id is not null;

create index if not exists post_hobby_tags_name_lower_idx
  on public.post_hobby_tags (lower(name));

create index if not exists post_hobby_tags_post_id_idx
  on public.post_hobby_tags (post_id);

alter table public.post_hobby_tags enable row level security;

drop policy if exists "post_hobby_tags_select_auth" on public.post_hobby_tags;
drop policy if exists "post_hobby_tags_insert_own" on public.post_hobby_tags;
drop policy if exists "post_hobby_tags_delete_own" on public.post_hobby_tags;

create policy "post_hobby_tags_select_auth"
  on public.post_hobby_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.deleted_at is null
    )
  );

create policy "post_hobby_tags_insert_own"
  on public.post_hobby_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
  );

create policy "post_hobby_tags_delete_own"
  on public.post_hobby_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

grant select, insert, delete on table public.post_hobby_tags to authenticated;

-- ---------------------------------------------------------------------------
-- Tag overlap helper (viewer hobby_tags ∩ post tags)
-- ---------------------------------------------------------------------------

create or replace function public.post_overlaps_viewer_tags(
  p_post_id uuid,
  p_viewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.post_hobby_tags t
    cross join lateral jsonb_array_elements(
      coalesce(
        (select u.hobby_tags from public.users u where u.id = p_viewer_id),
        '[]'::jsonb
      )
    ) v
    where t.post_id = p_post_id
      and (
        (
          t.hobby_id is not null
          and (v->>'hobbyId') ~ '^[0-9]+$'
          and t.hobby_id = (v->>'hobbyId')::integer
        )
        or lower(t.name) = lower(trim(both from coalesce(v->>'name', '')))
      )
  );
$$;

grant execute on function public.post_overlaps_viewer_tags(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_post_with_tags — atomic post + tags (media uploaded client-side after)
-- ---------------------------------------------------------------------------

create or replace function public.create_post_with_tags(
  p_caption text,
  p_tags jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_hobby_tags jsonb;
  v_post_id uuid;
  v_tag jsonb;
  v_name text;
  v_source text;
  v_hobby_id integer;
  v_count int := 0;
  v_matched boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select u.username, u.hobby_tags
  into v_username, v_hobby_tags
  from public.users u
  where u.id = v_uid;

  if v_username is null then
    raise exception 'Claim a username before posting.';
  end if;

  if jsonb_typeof(coalesce(v_hobby_tags, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_hobby_tags, '[]'::jsonb)) = 0 then
    raise exception 'Add a hobby to your profile before posting.';
  end if;

  if jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(p_tags) < 1
     or jsonb_array_length(p_tags) > 5 then
    raise exception 'Add at least one hobby tag.';
  end if;

  if char_length(coalesce(p_caption, '')) > 2200 then
    raise exception 'Caption too long';
  end if;

  insert into public.posts (author_id, caption)
  values (v_uid, coalesce(p_caption, ''))
  returning id into v_post_id;

  for v_tag in select * from jsonb_array_elements(p_tags)
  loop
    v_name := trim(both from coalesce(v_tag->>'name', ''));
    v_source := coalesce(v_tag->>'source', '');
    if v_tag ? 'hobbyId' and v_tag->>'hobbyId' is not null and v_tag->>'hobbyId' <> 'null' then
      begin
        v_hobby_id := (v_tag->>'hobbyId')::integer;
      exception when others then
        v_hobby_id := null;
      end;
    else
      v_hobby_id := null;
    end if;

    if char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Invalid tag name';
    end if;

    if v_source not in ('catalog', 'custom') then
      raise exception 'Invalid tag source';
    end if;

    if v_source = 'catalog' and v_hobby_id is null then
      raise exception 'Catalog tags require hobbyId';
    end if;
    if v_source = 'custom' then
      v_hobby_id := null;
    end if;

    select exists (
      select 1
      from jsonb_array_elements(v_hobby_tags) vt
      where (
        (
          v_hobby_id is not null
          and (vt->>'hobbyId') ~ '^[0-9]+$'
          and (vt->>'hobbyId')::integer = v_hobby_id
        )
        or lower(trim(both from coalesce(vt->>'name', ''))) = lower(v_name)
      )
    ) into v_matched;

    if not v_matched then
      raise exception 'You can only tag hobbies on your profile.';
    end if;

    if not exists (
      select 1 from public.post_hobby_tags existing
      where existing.post_id = v_post_id
        and (
          (v_hobby_id is not null and existing.hobby_id = v_hobby_id)
          or lower(existing.name) = lower(v_name)
        )
    ) then
      insert into public.post_hobby_tags (post_id, hobby_id, name, source)
      values (v_post_id, v_hobby_id, v_name, v_source);
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count < 1 then
    delete from public.posts where id = v_post_id;
    raise exception 'Add at least one hobby tag.';
  end if;

  if not exists (select 1 from public.post_hobby_tags where post_id = v_post_id) then
    delete from public.posts where id = v_post_id;
    raise exception 'Add at least one hobby tag.';
  end if;

  return v_post_id;
end;
$$;

grant execute on function public.create_post_with_tags(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- list_feed — tag-scoped Home + tags payload
-- ---------------------------------------------------------------------------

drop function if exists public.list_feed(int, timestamptz, uuid, uuid);
drop function if exists public.list_feed(int, timestamptz, uuid, uuid, text, int, boolean);

create or replace function public.list_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_author_id uuid default null,
  p_tag_filter text default null,
  p_hobby_id_filter int default null,
  p_viewer_scoped boolean default true
)
returns table (
  id uuid,
  author_id uuid,
  caption text,
  created_at timestamptz,
  username text,
  display_name text,
  media jsonb,
  tags jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.author_id,
    p.caption,
    p.created_at,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username) as display_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'kind', m.kind,
            'storage_path', m.storage_path,
            'public_url', m.public_url,
            'mime_type', m.mime_type,
            'width', m.width,
            'height', m.height,
            'duration_ms', m.duration_ms,
            'sort_order', m.sort_order
          )
          order by m.sort_order
        )
        from public.post_media m
        where m.post_id = p.id
      ),
      '[]'::jsonb
    ) as media,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'hobbyId', t.hobby_id,
            'name', t.name,
            'source', t.source
          )
          order by t.name
        )
        from public.post_hobby_tags t
        where t.post_id = p.id
      ),
      '[]'::jsonb
    ) as tags
  from public.posts p
  join public.users u on u.id = p.author_id
  where p.deleted_at is null
    and u.username is not null
    and (p_author_id is null or p.author_id = p_author_id)
    and (
      -- Profile grid / discovery browse: no viewer intersection
      coalesce(p_viewer_scoped, true) = false
      or p_author_id is not null
      or (
        auth.uid() is not null
        and public.post_overlaps_viewer_tags(p.id, auth.uid())
      )
    )
    and (
      p_hobby_id_filter is null
      or exists (
        select 1 from public.post_hobby_tags t
        where t.post_id = p.id and t.hobby_id = p_hobby_id_filter
      )
    )
    and (
      p_tag_filter is null
      or length(trim(both from p_tag_filter)) = 0
      or exists (
        select 1 from public.post_hobby_tags t
        where t.post_id = p.id
          and lower(t.name) = lower(trim(both from p_tag_filter))
      )
    )
    and (
      p_before_created_at is null
      or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.list_feed(int, timestamptz, uuid, uuid, text, int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- search_profiles — username, display name, OR hobby tag name
-- ---------------------------------------------------------------------------

drop function if exists public.search_profiles(text, int);

create or replace function public.search_profiles(q text, lim int default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  rating integer,
  league_id text,
  current_streak integer,
  hobby_tags jsonb
)
language sql
security definer
set search_path = public
as $$
  with qq as (
    select lower(trim(both from coalesce(q, ''))) as q
  )
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    g.rating,
    g.league_id,
    g.current_streak,
    coalesce(u.hobby_tags, '[]'::jsonb)
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  cross join qq
  where u.username is not null
    and length(qq.q) >= 2
    and (
      u.username like qq.q || '%'
      or lower(coalesce(u.full_name, '')) like '%' || qq.q || '%'
      or exists (
        select 1
        from jsonb_array_elements(coalesce(u.hobby_tags, '[]'::jsonb)) t
        where lower(coalesce(t->>'name', '')) like '%' || qq.q || '%'
      )
    )
  order by
    case when u.username like qq.q || '%' then 0 else 1 end,
    u.username
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_profiles(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- search_hobby_tags — catalog + custom names
-- ---------------------------------------------------------------------------

create or replace function public.search_hobby_tags(q text, lim int default 20)
returns table (
  hobby_id integer,
  name text,
  source text
)
language sql
security definer
set search_path = public
as $$
  with qq as (
    select lower(trim(both from coalesce(q, ''))) as q
  ),
  catalog as (
    select
      h.id as hobby_id,
      h.name,
      'catalog'::text as source,
      0 as rank_group
    from public.all_hobbies h
    cross join qq
    where length(qq.q) >= 2
      and lower(h.name) like '%' || qq.q || '%'
  ),
  custom as (
    select distinct on (lower(t->>'name'))
      null::integer as hobby_id,
      trim(both from t->>'name') as name,
      'custom'::text as source,
      1 as rank_group
    from public.users u
    cross join lateral jsonb_array_elements(coalesce(u.hobby_tags, '[]'::jsonb)) t
    cross join qq
    where length(qq.q) >= 2
      and coalesce(t->>'source', '') = 'custom'
      and lower(coalesce(t->>'name', '')) like '%' || qq.q || '%'
      and char_length(trim(both from coalesce(t->>'name', ''))) > 0
    order by lower(t->>'name')
  )
  select hobby_id, name, source
  from (
    select * from catalog
    union all
    select * from custom
  ) s
  order by rank_group, name
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_hobby_tags(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Admins (migration 20260712150000) — paste user_id from public.users in Dashboard
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default ''
);

alter table public.admins enable row level security;

grant select, insert, update, delete on table public.admins to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'admins', 'users', 'user_preferences', 'hobbies', 'user_plans',
    'chat_conversations', 'roadmaps', 'roadmap_nodes', 'roadmap_lessons',
    'user_gamification', 'daily_tasks', 'daily_task_days', 'leagues', 'user_pacts',
    'profile_social_links', 'posts', 'post_media', 'hobby_category',
    'all_hobbies', 'post_hobby_tags', 'post_likes', 'post_comments'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "ADMIN_can_do_all_ops" on public.%I', t);
    execute format(
      $policy$
        create policy "ADMIN_can_do_all_ops"
          on public.%I for all to authenticated
          using (public.is_admin())
          with check (public.is_admin())
      $policy$,
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on table public.leagues to authenticated;
grant select, insert, update, delete on table public.hobby_category to authenticated;
grant select, insert, update, delete on table public.all_hobbies to authenticated;
grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.posts to authenticated;
grant select, insert, update, delete on table public.post_comments to authenticated;
grant select, insert, update, delete on table public.post_media to authenticated;
grant select, insert, update, delete on table public.post_hobby_tags to authenticated;
grant select, insert, update, delete on table public.post_likes to authenticated;
grant select, insert, update, delete on table public.user_gamification to authenticated;
grant select, insert, update, delete on table public.profile_social_links to authenticated;
