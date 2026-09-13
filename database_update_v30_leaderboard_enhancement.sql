-- SSC With Jagrat — v30 Leaderboard Enhancement
-- Run AFTER database_update_v29_profile_enhancement.sql.
-- Adds secure weekly/monthly/all-time leaderboard data with rank, streak,
-- avatar and current-user highlighting. Does not expose user IDs.

create or replace function public.get_leaderboard(p_period text default 'all', p_limit integer default 50)
returns table(
  rank_no bigint,
  display_name text,
  avatar_url text,
  total_score numeric,
  quizzes_taken bigint,
  current_streak bigint,
  is_me boolean
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select case lower(coalesce(p_period,'all'))
      when 'week' then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else null
    end as since_ts
  ),
  attempts_in_period as (
    select qa.user_id, qa.class_id, qa.score, qa.created_at
    from public.quiz_attempts qa
    cross join params p
    where p.since_ts is null or qa.created_at >= p.since_ts
  ),
  best_by_class as (
    select user_id, class_id, max(score) as best_score
    from attempts_in_period
    group by user_id, class_id
  ),
  scores as (
    select b.user_id,
           sum(b.best_score) as total_score,
           count(*)::bigint as classes_scored,
           (select count(*) from attempts_in_period a where a.user_id = b.user_id)::bigint as quizzes_taken
    from best_by_class b
    group by b.user_id
  ),
  activity as (
    select d.user_id, count(*)::bigint as current_streak
    from public.daily_activity d
    where d.activity_date >= current_date - 365
      and not exists (
        select 1 from public.daily_activity newer
        where newer.user_id = d.user_id
          and newer.activity_date > d.activity_date
          and newer.activity_date <= current_date
          and newer.activity_date <> d.activity_date
          and newer.activity_date > d.activity_date + 1
      )
    group by d.user_id
  ),
  -- Calculate the true consecutive-day streak ending today (or yesterday).
  streaks as (
    select s.user_id,
           case
             when max(s.activity_date) < current_date - 1 then 0
             else (
               select count(*)::bigint
               from generate_series(0, 365) g(n)
               where exists (
                 select 1 from public.daily_activity dd
                 where dd.user_id = s.user_id
                   and dd.activity_date = current_date - g.n
               )
               and not exists (
                 select 1 from public.daily_activity stop
                 where stop.user_id = s.user_id
                   and stop.activity_date = current_date - g.n
                   and not exists (
                     select 1 from public.daily_activity prev
                     where prev.user_id = s.user_id
                       and prev.activity_date = current_date - (g.n + 1)
                   )
                   and g.n > 0
               )
             )
           end as current_streak
    from public.daily_activity s
    group by s.user_id
  ),
  ranked as (
    select
      row_number() over (order by sc.total_score desc, sc.quizzes_taken desc, sc.user_id) as rank_no,
      coalesce(nullif(trim(pr.display_name),''),'Student') as display_name,
      pr.avatar_url,
      sc.total_score,
      sc.quizzes_taken,
      coalesce(st.current_streak,0)::bigint as current_streak,
      (auth.uid() = sc.user_id) as is_me
    from scores sc
    left join public.profiles pr on pr.user_id = sc.user_id
    left join streaks st on st.user_id = sc.user_id
  )
  select * from ranked
  where rank_no <= greatest(1, least(coalesce(p_limit,50),100))
  order by rank_no;
$$;

revoke all on function public.get_leaderboard(text, integer) from public;
grant execute on function public.get_leaderboard(text, integer) to anon, authenticated;
