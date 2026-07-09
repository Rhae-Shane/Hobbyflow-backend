-- User onboarding preferences stored on profiles

alter table public.profiles
  add column if not exists preferences jsonb;

create index if not exists profiles_preferences_idx on public.profiles using gin (preferences);
