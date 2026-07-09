-- Gate: users who finished preferences + first hobby setup
alter table public.users
  add column if not exists completed_onboarding_at timestamptz;

create index if not exists users_completed_onboarding_at_idx
  on public.users (completed_onboarding_at)
  where completed_onboarding_at is not null;
