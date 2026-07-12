-- Allow multiple concurrent active pacts per user.
drop index if exists public.user_pacts_one_active_per_user;
