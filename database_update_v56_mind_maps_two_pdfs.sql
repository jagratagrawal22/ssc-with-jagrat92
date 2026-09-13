-- V56: Dual Parmar GK batches + two Mind Map PDFs per subject + dedicated Mind Maps bucket.
-- Safe/idempotent. Existing class/video data is preserved.

-- 1) Keep class content separated by batch.
alter table public.classes add column if not exists batch text not null default '4.0';
alter table public.classes drop constraint if exists classes_batch_check;
alter table public.classes add constraint classes_batch_check check (batch in ('4.0','5.0'));

-- 2) Rebuild the public class metadata view with batch support.
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

-- 3) Two Mind Map PDFs per subject and per batch.
create table if not exists public.subject_batch_materials (
  id uuid primary key default gen_random_uuid(),
  batch text not null check (batch in ('4.0','5.0')),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  mind_map_url text,
  mind_map_english_url text,
  mind_map_hindi_url text,
  updated_at timestamptz not null default now(),
  unique(batch, subject_id)
);

alter table public.subject_batch_materials
  add column if not exists mind_map_english_url text,
  add column if not exists mind_map_hindi_url text;

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

-- 4) Dedicated public Mind Maps bucket. Class PDFs remain in `materials`,
-- uploaded class videos remain in `videos`; their paths already include 4.0/5.0.
insert into storage.buckets (id,name,public) values ('mind-maps','mind-maps',true)
on conflict (id) do update set public=true;

drop policy if exists "public read mind maps" on storage.objects;
create policy "public read mind maps" on storage.objects
  for select using (bucket_id='mind-maps');

drop policy if exists "admin upload mind maps" on storage.objects;
create policy "admin upload mind maps" on storage.objects
  for insert to authenticated
  with check (bucket_id='mind-maps' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "admin update mind maps" on storage.objects;
create policy "admin update mind maps" on storage.objects
  for update to authenticated
  using (bucket_id='mind-maps' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check (bucket_id='mind-maps' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "admin delete mind maps" on storage.objects;
create policy "admin delete mind maps" on storage.objects
  for delete to authenticated
  using (bucket_id='mind-maps' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');
