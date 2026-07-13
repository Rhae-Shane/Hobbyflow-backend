-- Spec 15 / product brief: allow striking lessons out of the learning path.

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
    'failed',
    'skipped'
  ));

comment on column public.roadmap_lessons.status is
  'Lesson lifecycle; skipped = user struck the lesson out of the active path';
