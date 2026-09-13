-- ============================================================
-- SSC With Jagrat — UPDATE v10 (Batch 1: Quiz engine + Bookmarks)
-- Run this AFTER database.sql and database_update_v9.sql.
-- Only ADDS new tables/policies — does not touch any existing
-- table, column, row, or policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1) QUIZ ENGINE
-- ------------------------------------------------------------
-- One row per MCQ question, attached to a class.
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('a','b','c','d')),
  explanation text,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table public.quiz_questions enable row level security;

-- Publicly readable (same trust model as classes/subjects) — the
-- get-media-url gating still controls whether a student can reach
-- the class page in the first place; the quiz itself follows suit.
drop policy if exists "public read quiz questions" on public.quiz_questions;
create policy "public read quiz questions" on public.quiz_questions
  for select using (true);

drop policy if exists "admin manage quiz questions" on public.quiz_questions;
create policy "admin manage quiz questions" on public.quiz_questions
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

-- One row per user per class attempt (a user can retake; we keep every
-- attempt so a future leaderboard/streak feature has real history).
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  score int not null,
  total int not null,
  created_at timestamptz default now()
);

alter table public.quiz_attempts enable row level security;

drop policy if exists "user reads own quiz attempts" on public.quiz_attempts;
create policy "user reads own quiz attempts" on public.quiz_attempts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user inserts own quiz attempts" on public.quiz_attempts;
create policy "user inserts own quiz attempts" on public.quiz_attempts
  for insert to authenticated with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) BOOKMARKS ("save for later")
-- ------------------------------------------------------------
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, class_id)
);

alter table public.bookmarks enable row level security;

drop policy if exists "user reads own bookmarks" on public.bookmarks;
create policy "user reads own bookmarks" on public.bookmarks
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user inserts own bookmarks" on public.bookmarks;
create policy "user inserts own bookmarks" on public.bookmarks
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user deletes own bookmarks" on public.bookmarks;
create policy "user deletes own bookmarks" on public.bookmarks
  for delete to authenticated using (auth.uid() = user_id);
