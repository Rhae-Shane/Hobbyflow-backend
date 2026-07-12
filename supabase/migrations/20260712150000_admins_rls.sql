-- Admins: separate table of privileged users (user_id pasted from public.users
-- via Supabase Dashboard). RLS policy ADMIN_can_do_all_ops on every public
-- table so admins may select/insert/update/delete any row.

-- ---------------------------------------------------------------------------
-- 1. admins table
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default ''
);

comment on table public.admins is
  'Privileged users. Insert user_id from public.users via Dashboard (bypasses RLS).';

alter table public.admins enable row level security;

-- Membership is managed in Dashboard / service role. Authenticated clients may
-- touch this table only when already an admin (bootstrap first admin via SQL Editor).
grant select, insert, update, delete on table public.admins to authenticated;

-- ---------------------------------------------------------------------------
-- 2. is_admin() — SECURITY DEFINER so RLS on admins does not recurse
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ADMIN_can_do_all_ops on all RLS-enabled public tables
-- ---------------------------------------------------------------------------

-- Helper: drop + create FOR ALL policy (idempotent re-runs)
do $$
declare
  t text;
  tables text[] := array[
    'admins',
    'users',
    'user_preferences',
    'hobbies',
    'user_plans',
    'chat_conversations',
    'roadmaps',
    'roadmap_nodes',
    'roadmap_lessons',
    'user_gamification',
    'daily_tasks',
    'leagues',
    'user_pacts',
    'profile_social_links',
    'posts',
    'post_media',
    'hobby_category',
    'all_hobbies',
    'post_hobby_tags',
    'post_likes',
    'post_comments'
  ];
begin
  foreach t in array tables
  loop
    execute format('drop policy if exists "ADMIN_can_do_all_ops" on public.%I', t);
    execute format(
      $policy$
        create policy "ADMIN_can_do_all_ops"
          on public.%I
          for all
          to authenticated
          using (public.is_admin())
          with check (public.is_admin())
      $policy$,
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grants so admin policies can actually write/delete where tables were
--    previously select-only (or missing delete) for authenticated
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.leagues to authenticated;
grant select, insert, update, delete on table public.hobby_category to authenticated;
grant select, insert, update, delete on table public.all_hobbies to authenticated;

-- users / preferences / posts / comments: ensure delete (and full CRUD) for admins
grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.posts to authenticated;
grant select, insert, update, delete on table public.post_comments to authenticated;
grant select, insert, update, delete on table public.post_media to authenticated;
grant select, insert, update, delete on table public.post_hobby_tags to authenticated;
grant select, insert, update, delete on table public.post_likes to authenticated;
grant select, insert, update, delete on table public.user_gamification to authenticated;
grant select, insert, update, delete on table public.profile_social_links to authenticated;
