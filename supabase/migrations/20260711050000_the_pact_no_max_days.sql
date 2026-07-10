-- Spec 20 follow-up: remove 90-day max on user_pacts (min 7 days only)

alter table public.user_pacts
  drop constraint if exists user_pacts_duration_ok;

alter table public.user_pacts
  add constraint user_pacts_duration_ok check (
    end_date >= (start_date + 6)
  );
