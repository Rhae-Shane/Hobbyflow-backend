-- Spec 28 — Roadmap exercises (lesson-scoped practices) + once-per-day rating audit.

create table if not exists public.roadmap_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  section_node_id uuid not null references public.roadmap_nodes (id) on delete cascade,
  lesson_id uuid not null references public.roadmap_lessons (id) on delete cascade,
  title text not null
    check (char_length(trim(title)) > 0 and char_length(title) <= 80),
  instructions text not null
    check (char_length(trim(instructions)) > 0 and char_length(instructions) <= 800),
  status text not null default 'incomplete'
    check (status in ('incomplete', 'complete')),
  sort_order integer not null default 0 check (sort_order >= 0),
  generated_by text not null default 'langgraph'
    check (generated_by in ('langgraph')),
  rating_awarded integer not null default 0 check (rating_awarded >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists roadmap_exercises_roadmap_idx
  on public.roadmap_exercises (roadmap_id);

create index if not exists roadmap_exercises_lesson_idx
  on public.roadmap_exercises (lesson_id);

create index if not exists roadmap_exercises_user_date_complete_idx
  on public.roadmap_exercises (user_id, completed_at)
  where status = 'complete';

alter table public.roadmap_exercises enable row level security;

drop policy if exists "roadmap_exercises_select_own" on public.roadmap_exercises;
drop policy if exists "roadmap_exercises_insert_own" on public.roadmap_exercises;
drop policy if exists "roadmap_exercises_update_own" on public.roadmap_exercises;
drop policy if exists "roadmap_exercises_delete_own" on public.roadmap_exercises;

create policy "roadmap_exercises_select_own"
  on public.roadmap_exercises for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes go through Express (service role). Keep insert/update/delete policies
-- for authenticated only if needed for rare client paths; prefer server writes.
create policy "roadmap_exercises_insert_own"
  on public.roadmap_exercises for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "roadmap_exercises_update_own"
  on public.roadmap_exercises for update
  to authenticated
  using (auth.uid() = user_id);

create policy "roadmap_exercises_delete_own"
  on public.roadmap_exercises for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.roadmap_exercises to authenticated;

create table if not exists public.exercise_rating_days (
  user_id uuid not null references public.users (id) on delete cascade,
  activity_date date not null,
  rating_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.exercise_rating_days enable row level security;

drop policy if exists "exercise_rating_days_select_own" on public.exercise_rating_days;
drop policy if exists "exercise_rating_days_insert_own" on public.exercise_rating_days;
drop policy if exists "exercise_rating_days_update_own" on public.exercise_rating_days;
drop policy if exists "exercise_rating_days_delete_own" on public.exercise_rating_days;

create policy "exercise_rating_days_select_own"
  on public.exercise_rating_days for select
  to authenticated
  using (auth.uid() = user_id);

create policy "exercise_rating_days_insert_own"
  on public.exercise_rating_days for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "exercise_rating_days_update_own"
  on public.exercise_rating_days for update
  to authenticated
  using (auth.uid() = user_id);

create policy "exercise_rating_days_delete_own"
  on public.exercise_rating_days for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.exercise_rating_days to authenticated;

drop trigger if exists set_exercise_rating_days_updated_at on public.exercise_rating_days;
create trigger set_exercise_rating_days_updated_at
  before update on public.exercise_rating_days
  for each row execute function public.set_updated_at();
