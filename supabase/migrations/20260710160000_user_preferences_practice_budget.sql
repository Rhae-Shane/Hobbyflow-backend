-- Practice environment and resource budget for AI roadmap personalization.
alter table public.user_preferences
  add column if not exists practice_environments text[] not null default '{}',
  add column if not exists resource_budget text not null default '';

create index if not exists user_preferences_practice_environments_idx
  on public.user_preferences using gin (practice_environments);
