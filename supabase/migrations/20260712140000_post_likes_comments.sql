-- Spec 25: post likes + flat comments; extend list_feed with engagement fields

-- ---------------------------------------------------------------------------
-- posts denormalized counts
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists like_count int not null default 0;

alter table public.posts
  add column if not exists comment_count int not null default 0;

alter table public.posts
  drop constraint if exists posts_like_count_nonneg;
alter table public.posts
  add constraint posts_like_count_nonneg check (like_count >= 0);

alter table public.posts
  drop constraint if exists posts_comment_count_nonneg;
alter table public.posts
  add constraint posts_comment_count_nonneg check (comment_count >= 0);

-- ---------------------------------------------------------------------------
-- post_likes
-- ---------------------------------------------------------------------------

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx
  on public.post_likes (user_id, created_at desc);

alter table public.post_likes enable row level security;

drop policy if exists "post_likes_select_auth" on public.post_likes;
drop policy if exists "post_likes_insert_own" on public.post_likes;
drop policy if exists "post_likes_delete_own" on public.post_likes;

create policy "post_likes_select_auth"
  on public.post_likes for select
  to authenticated
  using (true);

create policy "post_likes_insert_own"
  on public.post_likes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "post_likes_delete_own"
  on public.post_likes for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on table public.post_likes to authenticated;

-- ---------------------------------------------------------------------------
-- post_comments
-- ---------------------------------------------------------------------------

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint post_comments_body_len check (
    char_length(body) >= 1 and char_length(body) <= 1000
  )
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at desc)
  where deleted_at is null;

alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select_auth" on public.post_comments;
drop policy if exists "post_comments_insert_own" on public.post_comments;
drop policy if exists "post_comments_update_own" on public.post_comments;

create policy "post_comments_select_auth"
  on public.post_comments for select
  to authenticated
  using (deleted_at is null);

create policy "post_comments_insert_own"
  on public.post_comments for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "post_comments_update_own"
  on public.post_comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update on table public.post_comments to authenticated;

drop trigger if exists set_post_comments_updated_at on public.post_comments;
create trigger set_post_comments_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Count maintenance triggers
-- ---------------------------------------------------------------------------

create or replace function public.tg_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
      set like_count = like_count + 1
      where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
      set like_count = greatest(like_count - 1, 0)
      where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_count_ins on public.post_likes;
drop trigger if exists post_likes_count_del on public.post_likes;

create trigger post_likes_count_ins
  after insert on public.post_likes
  for each row execute function public.tg_post_likes_count();

create trigger post_likes_count_del
  after delete on public.post_likes
  for each row execute function public.tg_post_likes_count();

create or replace function public.tg_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
      set comment_count = comment_count + 1
      where id = new.post_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts
        set comment_count = greatest(comment_count - 1, 0)
        where id = new.post_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts
        set comment_count = comment_count + 1
        where id = new.post_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists post_comments_count_ins on public.post_comments;
drop trigger if exists post_comments_count_upd on public.post_comments;

create trigger post_comments_count_ins
  after insert on public.post_comments
  for each row execute function public.tg_post_comments_count();

create trigger post_comments_count_upd
  after update of deleted_at on public.post_comments
  for each row execute function public.tg_post_comments_count();

-- ---------------------------------------------------------------------------
-- toggle_post_like
-- ---------------------------------------------------------------------------

create or replace function public.toggle_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_liked boolean;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.deleted_at is null
  ) then
    raise exception 'Post not found';
  end if;

  if exists (
    select 1 from public.post_likes
    where post_id = p_post_id and user_id = v_uid
  ) then
    delete from public.post_likes
    where post_id = p_post_id and user_id = v_uid;
    v_liked := false;
  else
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, v_uid);
    v_liked := true;
  end if;

  select like_count into v_count
  from public.posts
  where id = p_post_id;

  return jsonb_build_object(
    'liked', v_liked,
    'like_count', coalesce(v_count, 0)
  );
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_post_comments
-- ---------------------------------------------------------------------------

create or replace function public.list_post_comments(
  p_post_id uuid,
  p_limit int default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  username text,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.post_id,
    c.author_id,
    c.body,
    c.created_at,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username) as display_name
  from public.post_comments c
  join public.users u on u.id = c.author_id
  join public.posts p on p.id = c.post_id
  where c.post_id = p_post_id
    and c.deleted_at is null
    and p.deleted_at is null
    and (
      p_before_created_at is null
      or (c.created_at, c.id) > (p_before_created_at, p_before_id)
    )
  order by c.created_at asc, c.id asc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.list_post_comments(uuid, int, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- add_post_comment
-- ---------------------------------------------------------------------------

create or replace function public.add_post_comment(p_post_id uuid, p_body text)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  username text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(both from coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Comment must be 1–1000 characters';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.deleted_at is null
  ) then
    raise exception 'Post not found';
  end if;

  insert into public.post_comments (post_id, author_id, body)
  values (p_post_id, v_uid, v_body)
  returning post_comments.id into v_id;

  return query
  select
    c.id,
    c.post_id,
    c.author_id,
    c.body,
    c.created_at,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username) as display_name
  from public.post_comments c
  join public.users u on u.id = c.author_id
  where c.id = v_id;
end;
$$;

grant execute on function public.add_post_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- soft_delete_post_comment (own comment OR post author)
-- ---------------------------------------------------------------------------

create or replace function public.soft_delete_post_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_post_author uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select c.author_id, p.author_id
    into v_author, v_post_author
  from public.post_comments c
  join public.posts p on p.id = c.post_id
  where c.id = p_comment_id
    and c.deleted_at is null
    and p.deleted_at is null;

  if v_author is null then
    raise exception 'Comment not found';
  end if;

  if v_uid <> v_author and v_uid <> v_post_author then
    raise exception 'Not allowed';
  end if;

  update public.post_comments
    set deleted_at = now()
    where id = p_comment_id
      and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_post_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_feed — add like_count, comment_count, liked_by_me
-- ---------------------------------------------------------------------------

drop function if exists public.list_feed(int, timestamptz, uuid, uuid, text, int, boolean);

create or replace function public.list_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_author_id uuid default null,
  p_tag_filter text default null,
  p_hobby_id_filter int default null,
  p_viewer_scoped boolean default true
)
returns table (
  id uuid,
  author_id uuid,
  caption text,
  created_at timestamptz,
  username text,
  display_name text,
  media jsonb,
  tags jsonb,
  like_count int,
  comment_count int,
  liked_by_me boolean
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
    ) as media,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'hobbyId', t.hobby_id,
            'name', t.name,
            'source', t.source
          )
          order by t.name
        )
        from public.post_hobby_tags t
        where t.post_id = p.id
      ),
      '[]'::jsonb
    ) as tags,
    p.like_count,
    p.comment_count,
    exists (
      select 1
      from public.post_likes pl
      where pl.post_id = p.id
        and pl.user_id = auth.uid()
    ) as liked_by_me
  from public.posts p
  join public.users u on u.id = p.author_id
  where p.deleted_at is null
    and u.username is not null
    and (p_author_id is null or p.author_id = p_author_id)
    and (
      coalesce(p_viewer_scoped, true) = false
      or p_author_id is not null
      or (
        auth.uid() is not null
        and public.post_overlaps_viewer_tags(p.id, auth.uid())
      )
    )
    and (
      p_hobby_id_filter is null
      or exists (
        select 1 from public.post_hobby_tags t
        where t.post_id = p.id and t.hobby_id = p_hobby_id_filter
      )
    )
    and (
      p_tag_filter is null
      or length(trim(both from p_tag_filter)) = 0
      or exists (
        select 1 from public.post_hobby_tags t
        where t.post_id = p.id
          and lower(t.name) = lower(trim(both from p_tag_filter))
      )
    )
    and (
      p_before_created_at is null
      or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.list_feed(int, timestamptz, uuid, uuid, text, int, boolean) to authenticated;
