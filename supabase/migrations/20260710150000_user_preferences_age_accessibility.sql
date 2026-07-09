-- Age range, accessibility needs, and learning strengths for personalized roadmaps.
alter table public.user_preferences
  add column if not exists age_range text not null default '',
  add column if not exists accessibility_needs text[] not null default '{}',
  add column if not exists learning_strengths text[] not null default '{}';

create index if not exists user_preferences_accessibility_needs_idx
  on public.user_preferences using gin (accessibility_needs);
