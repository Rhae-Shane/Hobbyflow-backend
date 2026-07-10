-- Spec 14: concept mind map stored on roadmaps (Inspo-style projects.mindmap)

alter table public.roadmaps
  add column if not exists mindmap jsonb;

comment on column public.roadmaps.mindmap is
  'Spec 14: concept mind map tree (root/children/lessonNodeIds/metadata)';
