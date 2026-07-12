-- Filtered leaderboard candidate user ids (security definer — hobby_tags are not publicly selectable).

create or replace function public.leaderboard_user_ids(
  p_kind text,
  p_category_id integer default null,
  p_hobby_id integer default null,
  p_tag_name text default null
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with tagged as (
    select
      u.id as uid,
      t.elem
    from public.users u
    cross join lateral jsonb_array_elements(coalesce(u.hobby_tags, '[]'::jsonb)) as t(elem)
  )
  select distinct tagged.uid
  from tagged
  where
    case
      when p_kind = 'tag' and p_hobby_id is not null then
        nullif(tagged.elem->>'hobbyId', '')::integer = p_hobby_id
      when p_kind = 'tag' then
        lower(trim(both from coalesce(tagged.elem->>'name', '')))
          = lower(trim(both from coalesce(p_tag_name, '')))
      when p_kind = 'category' and p_category_id is not null then
        exists (
          select 1
          from public.all_hobbies h
          where h.id = nullif(tagged.elem->>'hobbyId', '')::integer
            and h.category_id = p_category_id
        )
      else false
    end;
$$;

revoke all on function public.leaderboard_user_ids(text, integer, integer, text) from public;
grant execute on function public.leaderboard_user_ids(text, integer, integer, text) to authenticated;
