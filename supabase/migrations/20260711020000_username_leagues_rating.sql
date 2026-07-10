-- Spec 19: unique username, leagues, rating (starts 699), profile search RPC

-- ---------------------------------------------------------------------------
-- leagues (seeded ranks)
-- ---------------------------------------------------------------------------

create table if not exists public.leagues (
  id text primary key,
  name text not null,
  sort_order integer not null unique,
  min_rating integer not null,
  max_rating integer not null,
  color_hex text not null default '#8B8178',
  icon_key text not null default 'shield',
  created_at timestamptz not null default now(),
  constraint leagues_rating_band check (min_rating <= max_rating)
);

create index if not exists leagues_min_rating_idx on public.leagues (min_rating);

insert into public.leagues (id, name, sort_order, min_rating, max_rating, color_hex, icon_key)
values
  ('wood', 'Wood', 1, 699, 799, '#A67C52', 'wood'),
  ('bronze', 'Bronze', 2, 800, 999, '#CD7F32', 'bronze'),
  ('silver', 'Silver', 3, 1000, 1199, '#C0C0C0', 'silver'),
  ('gold', 'Gold', 4, 1200, 1399, '#D4AF37', 'gold'),
  ('platinum', 'Platinum', 5, 1400, 1599, '#7CCBFA', 'platinum'),
  ('diamond', 'Diamond', 6, 1600, 1799, '#5BB8F0', 'diamond'),
  ('master', 'Master', 7, 1800, 1999, '#7C3AED', 'master'),
  ('legend', 'Legend', 8, 2000, 99999, '#E11D48', 'legend')
on conflict (id) do nothing;

alter table public.leagues enable row level security;

drop policy if exists "leagues_select_authenticated" on public.leagues;
create policy "leagues_select_authenticated"
  on public.leagues for select
  to authenticated
  using (true);

grant select on table public.leagues to authenticated;

-- ---------------------------------------------------------------------------
-- users: username + public profile fields
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz,
  add column if not exists is_profile_public boolean not null default true,
  add column if not exists bio text not null default '';

create unique index if not exists users_username_unique_ci
  on public.users (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_username_format'
  ) then
    alter table public.users
      add constraint users_username_format
      check (
        username is null
        or username ~ '^[a-z0-9_]{3,20}$'
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- user_gamification: rating + league (Spec 18 table must already exist)
-- ---------------------------------------------------------------------------

alter table public.user_gamification
  add column if not exists rating integer,
  add column if not exists peak_rating integer,
  add column if not exists league_id text;

update public.user_gamification
set
  rating = coalesce(rating, greatest(699, 699 + points)),
  peak_rating = coalesce(peak_rating, greatest(699, 699 + points))
where rating is null or peak_rating is null;

alter table public.user_gamification
  alter column rating set default 699,
  alter column peak_rating set default 699;

update public.user_gamification
set rating = 699
where rating is null;

update public.user_gamification
set peak_rating = 699
where peak_rating is null;

alter table public.user_gamification
  alter column rating set not null,
  alter column peak_rating set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_gamification_rating_floor'
  ) then
    alter table public.user_gamification
      add constraint user_gamification_rating_floor check (rating >= 699);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_gamification_peak_rating_floor'
  ) then
    alter table public.user_gamification
      add constraint user_gamification_peak_rating_floor check (peak_rating >= 699);
  end if;
end $$;

update public.user_gamification g
set league_id = (
  select l.id from public.leagues l
  where g.rating between l.min_rating and l.max_rating
  order by l.sort_order
  limit 1
)
where g.league_id is null;

alter table public.user_gamification
  alter column league_id set default 'wood';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_gamification_league_id_fkey'
  ) then
    alter table public.user_gamification
      add constraint user_gamification_league_id_fkey
      foreign key (league_id) references public.leagues (id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ranking_profiles view — prefer @username
-- ---------------------------------------------------------------------------

create or replace view public.ranking_profiles as
select
  id as user_id,
  coalesce(
    nullif(username, ''),
    nullif(trim(full_name), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Learner'
  ) as display_name,
  username
from public.users;

grant select on public.ranking_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- search + public profile RPCs
-- ---------------------------------------------------------------------------

create or replace function public.search_profiles(q text, lim int default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  rating integer,
  league_id text,
  current_streak integer,
  points integer
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
    g.current_streak,
    g.points
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
  points integer,
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
    g.points,
    g.current_streak,
    g.longest_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.is_profile_public = true
    and u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.users u
    where u.username = lower(trim(both from p_username))
  );
$$;

grant execute on function public.is_username_available(text) to authenticated;
