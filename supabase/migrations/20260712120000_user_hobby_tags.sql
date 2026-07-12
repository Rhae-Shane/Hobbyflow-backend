-- Spec 22: profile hobby tags from catalog matching during roadmap creation

alter table public.users
  add column if not exists hobby_tags jsonb not null default '[]'::jsonb;

alter table public.users
  drop constraint if exists users_hobby_tags_is_array;

alter table public.users
  add constraint users_hobby_tags_is_array
  check (jsonb_typeof(hobby_tags) = 'array');

comment on column public.users.hobby_tags is
  'Profile interest tags from catalog matching during roadmap creation. Each element: {"hobbyId": number|null, "name": string, "source": "catalog"|"custom"}';

create index if not exists users_hobby_tags_gin_idx
  on public.users using gin (hobby_tags);

drop function if exists public.get_public_profile(text);

create or replace function public.get_public_profile(p_username text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  hobby_tags jsonb,
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
    u.hobby_tags,
    g.rating,
    g.peak_rating,
    g.league_id,
    g.current_streak,
    g.longest_streak
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  where u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;
