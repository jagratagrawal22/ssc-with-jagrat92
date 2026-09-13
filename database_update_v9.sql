-- ============================================================
-- SSC With Jagrat — UPDATE v9
-- Run this AFTER database.sql. It only ADDS things — it does not
-- touch, alter, or delete any existing table, column, row, or policy.
-- Safe to re-run (all statements use IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- ------------------------------------------------------------
-- 1) HISTORY SUB-SECTIONS (Ancient / Medieval / Modern)
-- ------------------------------------------------------------
-- New optional column. Existing classes (History or otherwise)
-- get NULL automatically and keep showing exactly as before —
-- grouped sections only appear for classes where this is set.
alter table public.classes add column if not exists era text;

-- Only three allowed values, or NULL (ungrouped, current behaviour).
alter table public.classes drop constraint if exists classes_era_check;
alter table public.classes add constraint classes_era_check
  check (era is null or era in ('ancient','medieval','modern'));

-- ------------------------------------------------------------
-- 2) PROGRESS TRACKING ("mark class as complete")
-- ------------------------------------------------------------
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  completed_at timestamptz default now(),
  unique (user_id, class_id)
);

alter table public.progress enable row level security;

-- Users can only ever see/manage their OWN progress rows.
drop policy if exists "user reads own progress" on public.progress;
create policy "user reads own progress" on public.progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user inserts own progress" on public.progress;
create policy "user inserts own progress" on public.progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user deletes own progress" on public.progress;
create policy "user deletes own progress" on public.progress
  for delete to authenticated using (auth.uid() = user_id);
