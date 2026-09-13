-- ============================================================
-- SSC With Jagrat — UPDATE v12 (Batch 3: Daily GK feed + Admin analytics)
-- Run this AFTER database.sql, database_update_v9.sql,
-- database_update_v10.sql and database_update_v11.sql.
-- Only ADDS new tables/policies/views — does not touch any
-- existing table, column, row, or policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1) DAILY GK / CURRENT AFFAIRS FEED
-- ------------------------------------------------------------
create table if not exists public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  update_date date not null default current_date,
  published boolean default true,
  created_at timestamptz default now()
);

alter table public.daily_updates enable row level security;

drop policy if exists "public read published updates" on public.daily_updates;
create policy "public read published updates" on public.daily_updates
  for select using (published = true);

drop policy if exists "admin manage daily updates" on public.daily_updates;
create policy "admin manage daily updates" on public.daily_updates
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

-- ------------------------------------------------------------
-- 2) ADMIN ANALYTICS
-- ------------------------------------------------------------
-- Read-only, admin-only aggregation of existing tables (classes,
-- progress, quiz_attempts, subscriptions, daily_activity). No new
-- data collection — purely aggregation of what's already recorded.
--
-- Implemented as SECURITY DEFINER functions (not plain views) so they
-- can aggregate across all users' rows while still being locked to
-- the admin email specifically — a plain view would either leak
-- aggregate cross-user data to any authenticated user, or be blocked
-- entirely by the per-user RLS policies on the underlying tables.
create or replace function public.admin_class_engagement()
returns table (
  class_id uuid,
  title text,
  subject_name text,
  completions bigint,
  quiz_takers bigint,
  avg_quiz_score_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() ->> 'email') <> 'jalajsinghal04@gmail.com' then
    raise exception 'Not authorized';
  end if;
  return query
    select
      c.id, c.title, s.name,
      count(distinct p.user_id),
      count(distinct qa.user_id),
      coalesce(avg(qa.score::numeric / nullif(qa.total,0)) * 100, 0)
    from public.classes c
    left join public.subjects s on s.id = c.subject_id
    left join public.progress p on p.class_id = c.id
    left join public.quiz_attempts qa on qa.class_id = c.id
    group by c.id, c.title, s.name
    order by count(distinct p.user_id) desc;
end;
$$;

create or replace function public.admin_overview_stats()
returns table (
  total_users bigint,
  active_subscribers bigint,
  total_completions bigint,
  total_quiz_attempts bigint,
  active_today bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() ->> 'email') <> 'jalajsinghal04@gmail.com' then
    raise exception 'Not authorized';
  end if;
  return query select
    (select count(*) from auth.users),
    (select count(*) from public.subscriptions where status = 'active' and current_period_end > now()),
    (select count(*) from public.progress),
    (select count(*) from public.quiz_attempts),
    (select count(distinct user_id) from public.daily_activity where activity_date = current_date);
end;
$$;

revoke all on function public.admin_class_engagement() from anon;
revoke all on function public.admin_overview_stats() from anon;
grant execute on function public.admin_class_engagement() to authenticated;
grant execute on function public.admin_overview_stats() to authenticated;
-- Both functions self-check the caller's email server-side (see the
-- "Not authorized" guard above), so even though EXECUTE is granted to
-- all authenticated users, only the admin email actually gets data back.
