-- Spec 12: roadmap creation chat persistence + coach marks

alter table public.users
  add column if not exists feature_introductions jsonb not null default '{}';

comment on column public.users.feature_introductions is
  'Timestamps for feature coach marks, e.g. {"roadmapCreationSuggestionsSeenAt": "..."}';

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  hobby_id uuid references public.hobbies (id) on delete set null,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint chat_conversations_messages_is_array
    check (jsonb_typeof(messages) = 'array'),
  constraint chat_conversations_context_is_object
    check (jsonb_typeof(context) = 'object')
);

create index if not exists chat_conversations_user_id_idx
  on public.chat_conversations (user_id);

create index if not exists chat_conversations_user_workflow_idx
  on public.chat_conversations (user_id, ((context->>'workflow')))
  where archived_at is null;

create index if not exists chat_conversations_last_message_at_idx
  on public.chat_conversations (last_message_at desc nulls last);

alter table public.chat_conversations enable row level security;

create policy "chat_conversations_select_own"
  on public.chat_conversations for select
  using (auth.uid() = user_id);

create policy "chat_conversations_insert_own"
  on public.chat_conversations for insert
  with check (auth.uid() = user_id);

create policy "chat_conversations_update_own"
  on public.chat_conversations for update
  using (auth.uid() = user_id);

create policy "chat_conversations_delete_own"
  on public.chat_conversations for delete
  using (auth.uid() = user_id);
