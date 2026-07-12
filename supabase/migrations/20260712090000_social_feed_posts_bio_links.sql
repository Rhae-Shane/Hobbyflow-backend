-- Spec 21: social feed posts, always-public profiles, bio social links

-- ---------------------------------------------------------------------------
-- Drop public/private profiles
-- ---------------------------------------------------------------------------

alter table public.users
  drop column if exists is_profile_public;

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
  where u.username is not null
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
  where u.username = lower(trim(both from p_username))
  limit 1;
$$;

grant execute on function public.get_public_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bio social links
-- ---------------------------------------------------------------------------

create table if not exists public.profile_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null,
  url text not null,
  handle text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_social_links_platform_check check (
    platform in (
      'instagram',
      'youtube',
      'tiktok',
      'x',
      'linkedin',
      'github',
      'website',
      'other'
    )
  ),
  constraint profile_social_links_url_https check (url ~* '^https://')
);

create unique index if not exists profile_social_links_user_platform_unique
  on public.profile_social_links (user_id, platform)
  where platform <> 'other';

create index if not exists profile_social_links_user_id_idx
  on public.profile_social_links (user_id, sort_order);

alter table public.profile_social_links enable row level security;

drop policy if exists "profile_social_links_select_auth" on public.profile_social_links;
drop policy if exists "profile_social_links_insert_own" on public.profile_social_links;
drop policy if exists "profile_social_links_update_own" on public.profile_social_links;
drop policy if exists "profile_social_links_delete_own" on public.profile_social_links;

create policy "profile_social_links_select_auth"
  on public.profile_social_links for select
  to authenticated
  using (true);

create policy "profile_social_links_insert_own"
  on public.profile_social_links for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profile_social_links_update_own"
  on public.profile_social_links for update
  to authenticated
  using (auth.uid() = user_id);

create policy "profile_social_links_delete_own"
  on public.profile_social_links for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.profile_social_links to authenticated;

drop trigger if exists set_profile_social_links_updated_at on public.profile_social_links;
create trigger set_profile_social_links_updated_at
  before update on public.profile_social_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts + media
-- ---------------------------------------------------------------------------

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_caption_len check (char_length(caption) <= 2200)
);

create index if not exists posts_feed_idx
  on public.posts (created_at desc)
  where deleted_at is null;

create index if not exists posts_author_idx
  on public.posts (author_id, created_at desc)
  where deleted_at is null;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio')),
  storage_path text not null,
  public_url text not null,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_id_idx
  on public.post_media (post_id, sort_order);

alter table public.posts enable row level security;
alter table public.post_media enable row level security;

drop policy if exists "posts_select_auth" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;

create policy "posts_select_auth"
  on public.posts for select
  to authenticated
  using (deleted_at is null);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id);

drop policy if exists "post_media_select_auth" on public.post_media;
drop policy if exists "post_media_insert_own" on public.post_media;
drop policy if exists "post_media_delete_own" on public.post_media;

create policy "post_media_select_auth"
  on public.post_media for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.deleted_at is null
    )
  );

create policy "post_media_insert_own"
  on public.post_media for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create policy "post_media_delete_own"
  on public.post_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

grant select, insert, update on table public.posts to authenticated;
grant select, insert, delete on table public.post_media to authenticated;

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Keyset feed RPC
create or replace function public.list_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_author_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  caption text,
  created_at timestamptz,
  username text,
  display_name text,
  media jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.author_id,
    p.caption,
    p.created_at,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username) as display_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'kind', m.kind,
            'storage_path', m.storage_path,
            'public_url', m.public_url,
            'mime_type', m.mime_type,
            'width', m.width,
            'height', m.height,
            'duration_ms', m.duration_ms,
            'sort_order', m.sort_order
          )
          order by m.sort_order
        )
        from public.post_media m
        where m.post_id = p.id
      ),
      '[]'::jsonb
    ) as media
  from public.posts p
  join public.users u on u.id = p.author_id
  where p.deleted_at is null
    and u.username is not null
    and (p_author_id is null or p.author_id = p_author_id)
    and (
      p_before_created_at is null
      or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.list_feed(int, timestamptz, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: post-media bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/x-m4a',
    'audio/m4a'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post_media_public_read" on storage.objects;
drop policy if exists "post_media_insert_own" on storage.objects;
drop policy if exists "post_media_update_own" on storage.objects;
drop policy if exists "post_media_delete_own" on storage.objects;

create policy "post_media_public_read"
  on storage.objects for select
  using (bucket_id = 'post-media');

create policy "post_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
