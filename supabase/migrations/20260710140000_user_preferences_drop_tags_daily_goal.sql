-- Drop hobby-specific fields moved to per-hobby setup (hobbies table / onboarding).
drop index if exists public.user_preferences_selected_tags_idx;

alter table public.user_preferences
  drop column if exists selected_tags,
  drop column if exists daily_goal;
