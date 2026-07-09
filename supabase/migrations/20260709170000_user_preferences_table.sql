-- Move onboarding preferences from profiles.preferences JSONB to a dedicated table
-- with typed columns (text[] for multi-value fields).

create table public.user_preferences (
  user_id uuid references auth.users on delete cascade primary key,
  top_goals text[] not null default '{}',
  selected_tags text[] not null default '{}',
  user_roles text[] not null default '{}',
  learning_styles text[] not null default '{}',
  daily_goal text not null default '',
  content_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_preferences_selected_tags_idx
  on public.user_preferences using gin (selected_tags);

create index user_preferences_top_goals_idx
  on public.user_preferences using gin (top_goals);

alter table public.user_preferences enable row level security;

create policy "user_preferences_select_own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id);

grant select, insert, update on table public.user_preferences to authenticated;

create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Backfill from legacy profiles.preferences JSONB (if that column still exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'preferences'
  ) then
    insert into public.user_preferences (
      user_id,
      top_goals,
      selected_tags,
      user_roles,
      learning_styles,
      daily_goal,
      content_language
    )
    select
      p.id,
      case
        when p.preferences ? 'topGoals' and jsonb_typeof(p.preferences->'topGoals') = 'array'
        then array(select jsonb_array_elements_text(p.preferences->'topGoals'))
        else '{}'::text[]
      end,
      case
        when p.preferences ? 'selectedTags' and jsonb_typeof(p.preferences->'selectedTags') = 'array'
        then array(select jsonb_array_elements_text(p.preferences->'selectedTags'))
        else '{}'::text[]
      end,
      case
        when p.preferences ? 'userRoles' and jsonb_typeof(p.preferences->'userRoles') = 'array'
        then array(select jsonb_array_elements_text(p.preferences->'userRoles'))
        else '{}'::text[]
      end,
      case
        when p.preferences ? 'learningStyles' and jsonb_typeof(p.preferences->'learningStyles') = 'array'
        then array(select jsonb_array_elements_text(p.preferences->'learningStyles'))
        else '{}'::text[]
      end,
      coalesce(p.preferences->>'dailyGoal', ''),
      coalesce(nullif(p.preferences->>'contentLanguage', ''), 'en')
    from public.profiles p
    where p.preferences is not null
    on conflict (user_id) do nothing;

    drop index if exists public.profiles_preferences_idx;

    alter table public.profiles
      drop column preferences;
  end if;
end $$;
