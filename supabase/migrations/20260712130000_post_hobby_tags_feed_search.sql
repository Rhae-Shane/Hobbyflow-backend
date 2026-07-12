-- Spec 23: post hobby tags, tag-scoped feed, tag-aware search

-- ---------------------------------------------------------------------------
-- post_hobby_tags
-- ---------------------------------------------------------------------------

create table if not exists public.post_hobby_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  hobby_id integer references public.all_hobbies (id) on delete set null,
  name text not null,
  source text not null check (source in ('catalog', 'custom')),
  created_at timestamptz not null default now(),
  constraint post_hobby_tags_name_len check (
    char_length(trim(name)) between 1 and 80
  ),
  constraint post_hobby_tags_catalog_id check (
    (source = 'catalog' and hobby_id is not null)
    or (source = 'custom' and hobby_id is null)
  )
);

create unique index if not exists post_hobby_tags_post_hobby_id_uidx
  on public.post_hobby_tags (post_id, hobby_id)
  where hobby_id is not null;

create unique index if not exists post_hobby_tags_post_name_uidx
  on public.post_hobby_tags (post_id, lower(name));

create index if not exists post_hobby_tags_hobby_id_idx
  on public.post_hobby_tags (hobby_id)
  where hobby_id is not null;

create index if not exists post_hobby_tags_name_lower_idx
  on public.post_hobby_tags (lower(name));

create index if not exists post_hobby_tags_post_id_idx
  on public.post_hobby_tags (post_id);

alter table public.post_hobby_tags enable row level security;

drop policy if exists "post_hobby_tags_select_auth" on public.post_hobby_tags;
drop policy if exists "post_hobby_tags_insert_own" on public.post_hobby_tags;
drop policy if exists "post_hobby_tags_delete_own" on public.post_hobby_tags;

create policy "post_hobby_tags_select_auth"
  on public.post_hobby_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.deleted_at is null
    )
  );

create policy "post_hobby_tags_insert_own"
  on public.post_hobby_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
  );

create policy "post_hobby_tags_delete_own"
  on public.post_hobby_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

grant select, insert, delete on table public.post_hobby_tags to authenticated;

-- ---------------------------------------------------------------------------
-- Tag overlap helper (viewer hobby_tags ∩ post tags)
-- ---------------------------------------------------------------------------

create or replace function public.post_overlaps_viewer_tags(
  p_post_id uuid,
  p_viewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.post_hobby_tags t
    cross join lateral jsonb_array_elements(
      coalesce(
        (select u.hobby_tags from public.users u where u.id = p_viewer_id),
        '[]'::jsonb
      )
    ) v
    where t.post_id = p_post_id
      and (
        (
          t.hobby_id is not null
          and (v->>'hobbyId') ~ '^[0-9]+$'
          and t.hobby_id = (v->>'hobbyId')::integer
        )
        or lower(t.name) = lower(trim(both from coalesce(v->>'name', '')))
      )
  );
$$;

grant execute on function public.post_overlaps_viewer_tags(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_post_with_tags — atomic post + tags (media uploaded client-side after)
-- ---------------------------------------------------------------------------

create or replace function public.create_post_with_tags(
  p_caption text,
  p_tags jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_hobby_tags jsonb;
  v_post_id uuid;
  v_tag jsonb;
  v_name text;
  v_source text;
  v_hobby_id integer;
  v_count int := 0;
  v_matched boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select u.username, u.hobby_tags
  into v_username, v_hobby_tags
  from public.users u
  where u.id = v_uid;

  if v_username is null then
    raise exception 'Claim a username before posting.';
  end if;

  if jsonb_typeof(coalesce(v_hobby_tags, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_hobby_tags, '[]'::jsonb)) = 0 then
    raise exception 'Add a hobby to your profile before posting.';
  end if;

  if jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(p_tags) < 1
     or jsonb_array_length(p_tags) > 5 then
    raise exception 'Add at least one hobby tag.';
  end if;

  if char_length(coalesce(p_caption, '')) > 2200 then
    raise exception 'Caption too long';
  end if;

  insert into public.posts (author_id, caption)
  values (v_uid, coalesce(p_caption, ''))
  returning id into v_post_id;

  for v_tag in select * from jsonb_array_elements(p_tags)
  loop
    v_name := trim(both from coalesce(v_tag->>'name', ''));
    v_source := coalesce(v_tag->>'source', '');
    if v_tag ? 'hobbyId' and v_tag->>'hobbyId' is not null and v_tag->>'hobbyId' <> 'null' then
      begin
        v_hobby_id := (v_tag->>'hobbyId')::integer;
      exception when others then
        v_hobby_id := null;
      end;
    else
      v_hobby_id := null;
    end if;

    if char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Invalid tag name';
    end if;

    if v_source not in ('catalog', 'custom') then
      raise exception 'Invalid tag source';
    end if;

    if v_source = 'catalog' and v_hobby_id is null then
      raise exception 'Catalog tags require hobbyId';
    end if;
    if v_source = 'custom' then
      v_hobby_id := null;
    end if;

    select exists (
      select 1
      from jsonb_array_elements(v_hobby_tags) vt
      where (
        (
          v_hobby_id is not null
          and (vt->>'hobbyId') ~ '^[0-9]+$'
          and (vt->>'hobbyId')::integer = v_hobby_id
        )
        or lower(trim(both from coalesce(vt->>'name', ''))) = lower(v_name)
      )
    ) into v_matched;

    if not v_matched then
      raise exception 'You can only tag hobbies on your profile.';
    end if;

    if not exists (
      select 1 from public.post_hobby_tags existing
      where existing.post_id = v_post_id
        and (
          (v_hobby_id is not null and existing.hobby_id = v_hobby_id)
          or lower(existing.name) = lower(v_name)
        )
    ) then
      insert into public.post_hobby_tags (post_id, hobby_id, name, source)
      values (v_post_id, v_hobby_id, v_name, v_source);
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count < 1 then
    delete from public.posts where id = v_post_id;
    raise exception 'Add at least one hobby tag.';
  end if;

  if not exists (select 1 from public.post_hobby_tags where post_id = v_post_id) then
    delete from public.posts where id = v_post_id;
    raise exception 'Add at least one hobby tag.';
  end if;

  return v_post_id;
end;
$$;

grant execute on function public.create_post_with_tags(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- list_feed — tag-scoped Home + tags payload
-- ---------------------------------------------------------------------------

drop function if exists public.list_feed(int, timestamptz, uuid, uuid);
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
  tags jsonb
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
    ) as tags
  from public.posts p
  join public.users u on u.id = p.author_id
  where p.deleted_at is null
    and u.username is not null
    and (p_author_id is null or p.author_id = p_author_id)
    and (
      -- Profile grid / discovery browse: no viewer intersection
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

-- ---------------------------------------------------------------------------
-- search_profiles — username, display name, OR hobby tag name
-- ---------------------------------------------------------------------------

drop function if exists public.search_profiles(text, int);

create or replace function public.search_profiles(q text, lim int default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  rating integer,
  league_id text,
  current_streak integer,
  hobby_tags jsonb
)
language sql
security definer
set search_path = public
as $$
  with qq as (
    select lower(trim(both from coalesce(q, ''))) as q
  )
  select
    u.id,
    u.username,
    coalesce(nullif(trim(u.full_name), ''), u.username),
    g.rating,
    g.league_id,
    g.current_streak,
    coalesce(u.hobby_tags, '[]'::jsonb)
  from public.users u
  join public.user_gamification g on g.user_id = u.id
  cross join qq
  where u.username is not null
    and length(qq.q) >= 2
    and (
      u.username like qq.q || '%'
      or lower(coalesce(u.full_name, '')) like '%' || qq.q || '%'
      or exists (
        select 1
        from jsonb_array_elements(coalesce(u.hobby_tags, '[]'::jsonb)) t
        where lower(coalesce(t->>'name', '')) like '%' || qq.q || '%'
      )
    )
  order by
    case when u.username like qq.q || '%' then 0 else 1 end,
    u.username
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_profiles(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- search_hobby_tags — catalog + custom names
-- ---------------------------------------------------------------------------

create or replace function public.search_hobby_tags(q text, lim int default 20)
returns table (
  hobby_id integer,
  name text,
  source text
)
language sql
security definer
set search_path = public
as $$
  with qq as (
    select lower(trim(both from coalesce(q, ''))) as q
  ),
  catalog as (
    select
      h.id as hobby_id,
      h.name,
      'catalog'::text as source,
      0 as rank_group
    from public.all_hobbies h
    cross join qq
    where length(qq.q) >= 2
      and lower(h.name) like '%' || qq.q || '%'
  ),
  custom as (
    select distinct on (lower(t->>'name'))
      null::integer as hobby_id,
      trim(both from t->>'name') as name,
      'custom'::text as source,
      1 as rank_group
    from public.users u
    cross join lateral jsonb_array_elements(coalesce(u.hobby_tags, '[]'::jsonb)) t
    cross join qq
    where length(qq.q) >= 2
      and coalesce(t->>'source', '') = 'custom'
      and lower(coalesce(t->>'name', '')) like '%' || qq.q || '%'
      and char_length(trim(both from coalesce(t->>'name', ''))) > 0
    order by lower(t->>'name')
  )
  select hobby_id, name, source
  from (
    select * from catalog
    union all
    select * from custom
  ) s
  order by rank_group, name
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_hobby_tags(text, int) to authenticated;
