-- Spec 13: roadmap materialization (preview + section/lesson structure)

create table if not exists public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  hobby_id uuid not null references public.hobbies (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  lesson_plan_id uuid,
  outline jsonb not null default '{}'::jsonb,
  personalize_metadata jsonb not null default '{}'::jsonb,
  intro jsonb not null default '{}'::jsonb,
  cover_image_path text,
  status text not null default 'preview'
    check (status in ('preview', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmaps_outline_is_object
    check (jsonb_typeof(outline) = 'object'),
  constraint roadmaps_personalize_is_object
    check (jsonb_typeof(personalize_metadata) = 'object'),
  constraint roadmaps_intro_is_object
    check (jsonb_typeof(intro) = 'object')
);

create index if not exists roadmaps_user_id_idx on public.roadmaps (user_id);
create index if not exists roadmaps_hobby_id_idx on public.roadmaps (hobby_id);
create index if not exists roadmaps_user_status_idx
  on public.roadmaps (user_id, status)
  where status <> 'archived';

create trigger set_roadmaps_updated_at
  before update on public.roadmaps
  for each row execute function public.set_updated_at();

alter table public.roadmaps enable row level security;

create policy "roadmaps_select_own"
  on public.roadmaps for select
  using (auth.uid() = user_id);

create policy "roadmaps_insert_own"
  on public.roadmaps for insert
  with check (auth.uid() = user_id);

create policy "roadmaps_update_own"
  on public.roadmaps for update
  using (auth.uid() = user_id);

create policy "roadmaps_delete_own"
  on public.roadmaps for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.roadmaps to authenticated;

-- ---------------------------------------------------------------------------

create table if not exists public.roadmap_nodes (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('Section', 'Lesson')),
  name text not null check (char_length(trim(name)) > 0),
  content jsonb not null default '{"concepts":[],"sourceContent":""}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_nodes_content_is_object
    check (jsonb_typeof(content) = 'object'),
  constraint roadmap_nodes_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists roadmap_nodes_roadmap_id_idx
  on public.roadmap_nodes (roadmap_id);

create index if not exists roadmap_nodes_user_id_idx
  on public.roadmap_nodes (user_id);

create trigger set_roadmap_nodes_updated_at
  before update on public.roadmap_nodes
  for each row execute function public.set_updated_at();

alter table public.roadmap_nodes enable row level security;

create policy "roadmap_nodes_select_own"
  on public.roadmap_nodes for select
  using (auth.uid() = user_id);

create policy "roadmap_nodes_insert_own"
  on public.roadmap_nodes for insert
  with check (auth.uid() = user_id);

create policy "roadmap_nodes_update_own"
  on public.roadmap_nodes for update
  using (auth.uid() = user_id);

create policy "roadmap_nodes_delete_own"
  on public.roadmap_nodes for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.roadmap_nodes to authenticated;

-- ---------------------------------------------------------------------------

create table if not exists public.roadmap_lessons (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  node_id uuid not null references public.roadmap_nodes (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  path_order integer not null check (path_order >= 0),
  status text not null default 'pending_content'
    check (status in ('pending_content', 'ready', 'in_progress', 'completed')),
  session_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_lessons_session_config_is_object
    check (jsonb_typeof(session_config) = 'object'),
  constraint roadmap_lessons_roadmap_path_unique unique (roadmap_id, path_order)
);

create index if not exists roadmap_lessons_roadmap_id_idx
  on public.roadmap_lessons (roadmap_id);

create index if not exists roadmap_lessons_user_id_idx
  on public.roadmap_lessons (user_id);

create trigger set_roadmap_lessons_updated_at
  before update on public.roadmap_lessons
  for each row execute function public.set_updated_at();

alter table public.roadmap_lessons enable row level security;

create policy "roadmap_lessons_select_own"
  on public.roadmap_lessons for select
  using (auth.uid() = user_id);

create policy "roadmap_lessons_insert_own"
  on public.roadmap_lessons for insert
  with check (auth.uid() = user_id);

create policy "roadmap_lessons_update_own"
  on public.roadmap_lessons for update
  using (auth.uid() = user_id);

create policy "roadmap_lessons_delete_own"
  on public.roadmap_lessons for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.roadmap_lessons to authenticated;

comment on table public.roadmaps is
  'Spec 13: structured hobby roadmap materialized from approved outline';
comment on table public.roadmap_nodes is
  'Spec 13: Section and Lesson nodes for a roadmap (mindmap structure)';
comment on table public.roadmap_lessons is
  'Spec 13: ordered learning path; content generated later (pending_content)';
