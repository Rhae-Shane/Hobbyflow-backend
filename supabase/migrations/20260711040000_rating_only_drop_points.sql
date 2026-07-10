-- Rating-only economy: drop points, rename daily_tasks.points_reward → rating_reward

-- Ensure rating is populated before dropping points
update public.user_gamification
set
  rating = greatest(699, coalesce(rating, 699 + coalesce(points, 0))),
  peak_rating = greatest(
    coalesce(peak_rating, 699),
    greatest(699, coalesce(rating, 699 + coalesce(points, 0)))
  )
where true;

-- daily_tasks: points_reward → rating_reward
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_tasks'
      and column_name = 'points_reward'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_tasks'
      and column_name = 'rating_reward'
  ) then
    alter table public.daily_tasks rename column points_reward to rating_reward;
  end if;
end $$;

-- Drop points index + column
drop index if exists public.user_gamification_points_idx;

alter table public.user_gamification
  drop column if exists points;

create index if not exists user_gamification_rating_idx
  on public.user_gamification (rating desc, longest_streak desc);

-- RPCs without points (drop old signatures first — return type changed)
drop function if exists public.search_profiles(text, int);
drop function if exists public.get_public_profile(text);

create or replace function public.search_profiles(q text, lim int default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  rating integer,
  league_id text,
  current_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    g.rating,
    g.league_id,
    g.current_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.is_profile_public = true
    and u.username is not null
    and length(lower(trim(both from coalesce(q, '')))) >= 2
    and u.username like lower(trim(both from q)) || '%'
  order by u.username
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_profiles(text, int) to authenticated;

create or replace function public.get_public_profile(p_username text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  rating integer,
  peak_rating integer,
  league_id text,
  current_streak integer,
  longest_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    u.bio,
    g.rating,
    g.peak_rating,
    g.league_id,
    g.current_streak,
    g.longest_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.is_profile_public = true
    and u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;
