-- Spec 20: The Pact — hobby promises (≥1 week), fulfill count / break → rating penalty

-- ---------------------------------------------------------------------------
-- user_gamification: pacts kept counter
-- ---------------------------------------------------------------------------

alter table public.user_gamification
  add column if not exists pacts_fulfilled integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_gamification_pacts_fulfilled_check'
  ) then
    alter table public.user_gamification
      add constraint user_gamification_pacts_fulfilled_check
      check (pacts_fulfilled >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- user_pacts
-- ---------------------------------------------------------------------------

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

-- At most one active pact per user
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

-- Economy constants (app mirror):
-- PACT_MIN_DAYS = 7 (inclusive); no maximum duration
-- PACT_BREAK_RATING_PENALTY = 15 (applied in app to user_gamification.rating, floor 699)
