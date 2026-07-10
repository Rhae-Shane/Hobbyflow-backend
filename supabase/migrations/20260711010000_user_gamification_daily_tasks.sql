-- Spec 18: user gamification (streak, points, savers) + daily tasks

-- ---------------------------------------------------------------------------
-- user_gamification — 1:1 with users
-- ---------------------------------------------------------------------------

create table if not exists public.user_gamification (
  user_id uuid primary key references public.users (id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  streak_savers integer not null default 3 check (streak_savers >= 0 and streak_savers <= 99),
  activity_dates text[] not null default '{}',
  saver_used_dates text[] not null default '{}',
  last_activity_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_gamification_points_idx
  on public.user_gamification (points desc, longest_streak desc);

create index if not exists user_gamification_streak_idx
  on public.user_gamification (current_streak desc);

-- ---------------------------------------------------------------------------
-- daily_tasks — one task per user per calendar day
-- ---------------------------------------------------------------------------

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  hobby_id uuid references public.hobbies (id) on delete set null,
  task_date date not null,
  task_type text not null check (task_type in ('complete_lesson', 'practice_minutes')),
  title text not null,
  points_reward integer not null default 10 check (points_reward > 0),
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_tasks_user_date_unique unique (user_id, task_date)
);

create index if not exists daily_tasks_user_date_idx
  on public.daily_tasks (user_id, task_date desc);

create index if not exists daily_tasks_user_status_idx
  on public.daily_tasks (user_id, status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_user_gamification_updated_at on public.user_gamification;
create trigger set_user_gamification_updated_at
  before update on public.user_gamification
  for each row execute function public.set_updated_at();

drop trigger if exists set_daily_tasks_updated_at on public.daily_tasks;
create trigger set_daily_tasks_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_gamification enable row level security;
alter table public.daily_tasks enable row level security;

drop policy if exists "user_gamification_select_authenticated" on public.user_gamification;
drop policy if exists "user_gamification_insert_own" on public.user_gamification;
drop policy if exists "user_gamification_update_own" on public.user_gamification;
drop policy if exists "daily_tasks_select_own" on public.daily_tasks;
drop policy if exists "daily_tasks_insert_own" on public.daily_tasks;
drop policy if exists "daily_tasks_update_own" on public.daily_tasks;
drop policy if exists "daily_tasks_delete_own" on public.daily_tasks;

-- Ranking: any signed-in user can read points/streaks
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

-- ---------------------------------------------------------------------------
-- Ranking display names (no email exposure; owner view bypasses users RLS)
-- ---------------------------------------------------------------------------

create or replace view public.ranking_profiles as
select
  id as user_id,
  coalesce(
    nullif(trim(full_name), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Learner'
  ) as display_name
from public.users;

grant select on public.ranking_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill empty gamification rows for existing users (3 free savers)
-- ---------------------------------------------------------------------------

insert into public.user_gamification (user_id)
select u.id
from public.users u
on conflict (user_id) do nothing;
