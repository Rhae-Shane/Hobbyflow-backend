-- Spec 17: just-in-time lesson content generation (status + media bucket)

alter table public.roadmap_lessons
  drop constraint if exists roadmap_lessons_status_check;

alter table public.roadmap_lessons
  add constraint roadmap_lessons_status_check
  check (status in (
    'pending_content',
    'generating',
    'ready',
    'in_progress',
    'completed',
    'failed'
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-media',
  'lesson-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "lesson_media_public_read" on storage.objects;
drop policy if exists "lesson_media_service_insert" on storage.objects;
drop policy if exists "lesson_media_service_update" on storage.objects;
drop policy if exists "lesson_media_service_delete" on storage.objects;

create policy "lesson_media_public_read"
  on storage.objects for select
  using (bucket_id = 'lesson-media');

create policy "lesson_media_service_insert"
  on storage.objects for insert
  with check (bucket_id = 'lesson-media');

create policy "lesson_media_service_update"
  on storage.objects for update
  using (bucket_id = 'lesson-media');

create policy "lesson_media_service_delete"
  on storage.objects for delete
  using (bucket_id = 'lesson-media');
