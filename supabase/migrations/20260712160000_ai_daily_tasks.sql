-- Spec 26 — AI daily tasks (LangGraph lazy generate): multi-row per day, regenerate, bonus.

alter table public.daily_tasks
  drop constraint if exists daily_tasks_user_date_unique;

alter table public.daily_tasks
  add column if not exists counts_for_rating boolean not null default true,
  add column if not exists regenerates_used integer not null default 0,
  add column if not exists structured jsonb not null default '{}'::jsonb,
  add column if not exists rating_awarded integer not null default 0,
  add column if not exists generated_by text not null default 'langgraph';

alter table public.daily_tasks
  drop constraint if exists daily_tasks_regenerates_used_check;
alter table public.daily_tasks
  add constraint daily_tasks_regenerates_used_check
  check (regenerates_used >= 0 and regenerates_used <= 2);

alter table public.daily_tasks
  drop constraint if exists daily_tasks_rating_awarded_check;
alter table public.daily_tasks
  add constraint daily_tasks_rating_awarded_check
  check (rating_awarded >= 0);

alter table public.daily_tasks
  drop constraint if exists daily_tasks_generated_by_check;
alter table public.daily_tasks
  add constraint daily_tasks_generated_by_check
  check (generated_by in ('langgraph', 'legacy'));

alter table public.daily_tasks
  drop constraint if exists daily_tasks_task_type_check;
alter table public.daily_tasks
  add constraint daily_tasks_task_type_check
  check (task_type in ('complete_lesson', 'practice_minutes', 'custom'));

alter table public.daily_tasks
  drop constraint if exists daily_tasks_status_check;
alter table public.daily_tasks
  add constraint daily_tasks_status_check
  check (status in ('open', 'completed', 'expired', 'discarded'));

-- Mark existing template rows as legacy (all rows present at migration time).
update public.daily_tasks
set generated_by = 'legacy';

create unique index if not exists daily_tasks_one_open_primary
  on public.daily_tasks (user_id, task_date)
  where status = 'open' and counts_for_rating = true;

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

alter table public.daily_task_days enable row level security;

drop policy if exists "daily_task_days_select_own" on public.daily_task_days;
drop policy if exists "daily_task_days_insert_own" on public.daily_task_days;
drop policy if exists "daily_task_days_update_own" on public.daily_task_days;
drop policy if exists "daily_task_days_delete_own" on public.daily_task_days;

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

grant select, insert, update, delete on table public.daily_task_days to authenticated;

drop trigger if exists set_daily_task_days_updated_at on public.daily_task_days;
create trigger set_daily_task_days_updated_at
  before update on public.daily_task_days
  for each row execute function public.set_updated_at();
