-- ============================================================
-- SSC With Jagrat — UPDATE v13 (Security + Quiz Admin)
-- Run AFTER database.sql and database_update_v9.sql through v12.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PUBLIC CLASS METADATA ONLY
-- ------------------------------------------------------------
-- Protected URLs (uploaded video, PDFs and mock tests) are excluded from
-- the public class query. They remain available to the admin and to the
-- get-media-url function only.
drop view if exists public.classes_public;
create view public.classes_public as
select
  c.id,
  c.subject_id,
  c.class_no,
  c.title,
  case
    when coalesce((regexp_match(trim(c.class_no), '[0-9]+'))[1]::int, 0) = 1 then c.video_url
    else null
  end as video_url,
  c.thumbnail_url,
  c.published,
  c.era,
  c.created_at
from public.classes c
where c.published = true;

grant select on public.classes_public to anon, authenticated;

-- Remove the old broad table policy. Normal users use classes_public;
-- only the admin can read the underlying table containing protected URLs.
drop policy if exists "public read published classes" on public.classes;
drop policy if exists "admin read classes" on public.classes;
create policy "admin read classes" on public.classes
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');
grant select on public.classes to authenticated;
revoke select on public.classes from anon;

-- ------------------------------------------------------------
-- 2) QUIZ QUESTIONS: PUBLIC VIEW WITHOUT ANSWERS
-- ------------------------------------------------------------
drop view if exists public.quiz_questions_public;
create view public.quiz_questions_public as
select
  q.id,
  q.class_id,
  q.question,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.sort_order
from public.quiz_questions q
join public.classes c on c.id = q.class_id
where c.published = true;

grant select on public.quiz_questions_public to anon, authenticated;

drop policy if exists "public read quiz questions" on public.quiz_questions;
-- The existing "admin manage quiz questions" policy remains the only
-- source-table SELECT path for authenticated users.
revoke select on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to authenticated;

-- ------------------------------------------------------------
-- 3) SERVER-SIDE QUIZ SUBMISSION + SCORING
-- ------------------------------------------------------------
create or replace function public.submit_quiz_attempt(
  p_class_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_class_no text;
  v_is_free boolean := false;
  v_total integer := 0;
  v_score integer := 0;
  v_answered integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Please log in to submit the quiz.' using errcode = '42501';
  end if;

  if p_class_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid quiz submission.' using errcode = '22023';
  end if;

  select class_no into v_class_no
  from public.classes
  where id = p_class_id and published = true;

  if v_class_no is null then
    raise exception 'Class not found.' using errcode = 'P0002';
  end if;

  v_is_free := coalesce((regexp_match(trim(v_class_no), '[0-9]+'))[1]::int = 1, false);

  if not v_is_free and not exists (
    select 1
    from public.subscriptions s
    where s.user_id = v_user_id
      and s.status = 'active'
      and s.current_period_end > now()
  ) then
    raise exception 'A subscription is required for this quiz.' using errcode = '42501';
  end if;

  -- The answer key is read only inside this SECURITY DEFINER function.
  select count(*)::int
  into v_total
  from public.quiz_questions q
  where q.class_id = p_class_id;

  if v_total = 0 then
    raise exception 'This class has no quiz questions.' using errcode = 'P0002';
  end if;

  select count(*)::int,
         count(*) filter (
           where q.correct_option = lower(coalesce(p_answers ->> q.id::text, ''))
         )::int
  into v_answered, v_score
  from public.quiz_questions q
  where q.class_id = p_class_id
    and p_answers ? q.id::text;

  if v_answered <> v_total then
    raise exception 'Please answer every question before submitting.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'question_id', q.id,
      'chosen_option', lower(p_answers ->> q.id::text),
      'correct_option', q.correct_option,
      'explanation', q.explanation
    ) order by q.sort_order, q.created_at
  ), '[]'::jsonb)
  into v_results
  from public.quiz_questions q
  where q.class_id = p_class_id;

  insert into public.quiz_attempts (user_id, class_id, score, total)
  values (v_user_id, p_class_id, v_score, v_total);

  insert into public.daily_activity (user_id, activity_date)
  values (v_user_id, current_date)
  on conflict (user_id, activity_date) do nothing;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'results', v_results
  );
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

drop policy if exists "user inserts own quiz attempts" on public.quiz_attempts;
revoke insert on public.quiz_attempts from anon, authenticated;

-- ------------------------------------------------------------
-- 4) LEADERBOARD: NO USER ID + PRIVATE PROFILES
-- ------------------------------------------------------------
drop policy if exists "public read profiles" on public.profiles;
drop policy if exists "user reads own profile" on public.profiles;
create policy "user reads own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
grant select on public.profiles to authenticated;
revoke select on public.profiles from anon;

-- The old view exposed user_id. Drop and recreate it with only the fields
-- needed to render the public leaderboard.
drop view if exists public.leaderboard;
create view public.leaderboard as
select
  coalesce(p.display_name, 'Student') as display_name,
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
