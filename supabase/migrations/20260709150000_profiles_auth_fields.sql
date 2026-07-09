-- Extend profiles with auth provider fields and keep rows in sync with auth.users

alter table public.profiles
  add column if not exists provider text,
  add column if not exists email_verified boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider, email_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.raw_app_meta_data->>'provider', new.raw_app_meta_data->'providers'->>0),
    coalesce((new.raw_user_meta_data->>'email_verified')::boolean, new.email_confirmed_at is not null)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    provider = coalesce(new.raw_app_meta_data->>'provider', new.raw_app_meta_data->'providers'->>0),
    email_verified = coalesce((new.raw_user_meta_data->>'email_verified')::boolean, new.email_confirmed_at is not null),
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- Backfill existing auth users (e.g. Google sign-ins before trigger improvements)
insert into public.profiles (id, email, full_name, avatar_url, provider, email_verified)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  coalesce(u.raw_app_meta_data->>'provider', u.raw_app_meta_data->'providers'->>0),
  coalesce((u.raw_user_meta_data->>'email_verified')::boolean, u.email_confirmed_at is not null)
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  provider = excluded.provider,
  email_verified = excluded.email_verified,
  updated_at = now();
