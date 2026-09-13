-- V54: Separate Parmar GK Batch 4.0 / 5.0 content + subject-level Mind Maps
-- Run once in Supabase SQL Editor. Existing classes are assigned to Batch 4.0.

alter table public.classes add column if not exists batch text not null default '4.0';
alter table public.classes
drop constraint if exists classes_batch_check;
alter table public.classes add constraint classes_batch_check check (batch in ('4.0','5.0'));

-- Rebuild the public metadata view so the frontend can filter by batch.
drop view if exists public.classes_public;
create view public.classes_public as
select
  c.id, c.subject_id, c.class_no, c.title, c.batch,
  case
    when coalesce((regexp_match(trim(c.class_no), '[0-9]+'))[1]::int, 0) = 1 then c.video_url
    else null
  end as video_url,
  c.thumbnail_url, c.published, c.era, c.created_at
from public.classes c
where c.published = true;

grant select on public.classes_public to anon, authenticated;

-- Subject-level Mind Map PDFs, separately for each batch.
create table if not exists public.subject_batch_materials (
  id uuid primary key default gen_random_uuid(),
  batch text not null check (batch in ('4.0','5.0')),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  mind_map_url text,
  updated_at timestamptz not null default now(),
  unique(batch, subject_id)
);

alter table public.subject_batch_materials enable row level security;
drop policy if exists "public read subject batch mind maps" on public.subject_batch_materials;
create policy "public read subject batch mind maps" on public.subject_batch_materials
  for select to anon, authenticated using (true);
drop policy if exists "admin manage subject batch mind maps" on public.subject_batch_materials;
create policy "admin manage subject batch mind maps" on public.subject_batch_materials
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

grant select on public.subject_batch_materials to anon, authenticated;
grant insert, update, delete on public.subject_batch_materials to authenticated;
