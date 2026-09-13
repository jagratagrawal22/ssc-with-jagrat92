-- ============================================================
-- SSC With Jagrat — UPDATE v11 (Batch 2: Streaks + Leaderboard)
-- Run this AFTER database.sql, database_update_v9.sql and
-- database_update_v10.sql. Only ADDS new tables/policies/views —
-- does not touch any existing table, column, row, or policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1) STREAKS
-- ------------------------------------------------------------
-- One row per user per calendar day they did something (completed a
-- class or attempted a quiz). Cheap to query for "current streak"
-- without scanning progress/quiz_attempts on every page load.
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  primary key (user_id, activity_date)
);

alter table public.daily_activity enable row level security;

drop policy if exists "user reads own daily activity" on public.daily_activity;
create policy "user reads own daily activity" on public.daily_activity
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user inserts own daily activity" on public.daily_activity;
create policy "user inserts own daily activity" on public.daily_activity
  for insert to authenticated with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) LEADERBOARD
-- ------------------------------------------------------------
-- Public-readable view: best score per user per class, summed up,
-- joined to a display name. Does not expose email or user_id directly
-- to other students beyond what's needed to render a leaderboard row.
-- profiles table holds an optional display name a user can set for
-- the leaderboard; falls back to "Student" if not set.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text
);

alter table public.profiles enable row level security;

drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles" on public.profiles for select using (true);

drop policy if exists "user manages own profile" on public.profiles;
create policy "user manages own profile" on public.profiles
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Leaderboard view: best (highest-score) attempt per user per class,
-- summed into a total. Recomputed live from quiz_attempts — no
-- duplicated/stale data.
create or replace view public.leaderboard as
select
  best.user_id,
  coalesce(p.display_name, 'Student ' || substr(best.user_id::text, 1, 4)) as display_name,
  sum(best.best_score) as total_score,
  count(*) as quizzes_taken
from (
  select user_id, class_id, max(score) as best_score
  from public.quiz_attempts
  group by user_id, class_id
) best
left join public.profiles p on p.user_id = best.user_id
group by best.user_id, p.display_name;

grant select on public.leaderboard to authenticated, anon;
