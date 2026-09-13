-- SSC With Jagrat — UPDATE v17 (PYQ Intelligence + Advanced Analytics)
-- SAFE MIGRATION: additive only. Existing data/files are preserved.
-- Run AFTER database_update_v16_quiz2.sql.
--
-- Adds private answer-event telemetry for question/topic/PYQ analytics,
-- replaces only the Quiz 2.0 RPC to record those events, and adds an
-- admin-only aggregate analytics RPC. No existing attempts are deleted.

create table if not exists public.quiz_response_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid references public.quiz_attempts(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  topic text,
  difficulty text,
  is_pyq boolean not null default false,
  pyq_year integer,
  pyq_tier text,
  chosen_option text,
  is_correct boolean not null default false,
  marks_awarded numeric not null default 0,
  answered boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.quiz_response_events enable row level security;
drop policy if exists "user reads own quiz response events" on public.quiz_response_events;
create policy "user reads own quiz response events" on public.quiz_response_events
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.quiz_response_events from anon, authenticated;
grant select on public.quiz_response_events to authenticated;

create index if not exists quiz_response_events_user_idx
  on public.quiz_response_events(user_id, created_at desc);
create index if not exists quiz_response_events_topic_idx
  on public.quiz_response_events(user_id, topic);
create index if not exists quiz_response_events_pyq_idx
  on public.quiz_response_events(user_id, is_pyq, pyq_year, pyq_tier);

-- Recreate Quiz 2.0 submission with identical API plus private analytics logging.
create or replace function public.submit_quiz_attempt_v2(
  p_class_id uuid,
  p_question_ids uuid[],
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_class_no text;
  v_is_free boolean:=false;
  v_total integer:=0;
  v_answered integer:=0;
  v_correct integer:=0;
  v_wrong integer:=0;
  v_score numeric:=0;
  v_max_score numeric:=0;
  v_results jsonb:='[]'::jsonb;
  v_attempt_id uuid;
begin
  if v_user_id is null then raise exception 'Please log in to submit the quiz.' using errcode='42501'; end if;
  if p_class_id is null or p_question_ids is null or cardinality(p_question_ids)<1 or p_answers is null or jsonb_typeof(p_answers)<>'object' then
    raise exception 'Invalid quiz submission.' using errcode='22023';
  end if;
  select class_no into v_class_no from public.classes where id=p_class_id and published=true;
  if v_class_no is null then raise exception 'Class not found.' using errcode='P0002'; end if;
  v_is_free:=coalesce((regexp_match(trim(v_class_no),'[0-9]+'))[1]::int=1,false);
  if not v_is_free and not exists(select 1 from public.subscriptions s where s.user_id=v_user_id and s.status='active' and s.current_period_end>now()) then
    raise exception 'A subscription is required for this quiz.' using errcode='42501';
  end if;

  select count(*)::int,
         count(*) filter(where p_answers ? q.id::text)::int,
         count(*) filter(where lower(coalesce(p_answers->>q.id::text,''))=q.correct_option)::int,
         count(*) filter(where p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option)::int,
         coalesce(sum(q.marks),0)::numeric,
         coalesce(sum(case when not (p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end),0)::numeric
  into v_total,v_answered,v_correct,v_wrong,v_max_score,v_score
  from public.quiz_questions q
  where q.class_id=p_class_id and q.id=any(p_question_ids);

  if v_total<>cardinality(p_question_ids) then raise exception 'One or more quiz questions are invalid.' using errcode='22023'; end if;

  insert into public.quiz_mistakes(user_id,class_id,question_id,question,option_a,option_b,option_c,option_d,chosen_option,correct_option,explanation,next_review_at,review_count)
  select v_user_id,q.class_id,q.id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,lower(p_answers->>q.id::text),q.correct_option,q.explanation,now(),0
  from public.quiz_questions q
  where q.id=any(p_question_ids) and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option
  on conflict(user_id,question_id) do update set chosen_option=excluded.chosen_option,correct_option=excluded.correct_option,explanation=excluded.explanation,next_review_at=now();

  delete from public.quiz_mistakes m where m.user_id=v_user_id and m.question_id=any(p_question_ids)
    and exists(select 1 from public.quiz_questions q where q.id=m.question_id and q.correct_option=lower(coalesce(p_answers->>m.question_id::text,'')));

  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'chosen_option',lower(p_answers->>q.id::text),'correct_option',q.correct_option,
    'explanation',q.explanation,'marks',q.marks,'negative_marks',q.negative_marks,
    'is_correct',lower(p_answers->>q.id::text)=q.correct_option
  ) order by q.sort_order,q.created_at),'[]'::jsonb) into v_results
  from public.quiz_questions q where q.id=any(p_question_ids);

  insert into public.quiz_attempts(user_id,class_id,score,total)
  values(v_user_id,p_class_id,round(v_score,2),round(v_max_score,2))
  returning id into v_attempt_id;

  insert into public.quiz_response_events(
    user_id,attempt_id,class_id,question_id,topic,difficulty,is_pyq,pyq_year,pyq_tier,
    chosen_option,is_correct,marks_awarded,answered
  )
  select
    v_user_id,v_attempt_id,q.class_id,q.id,q.topic,q.difficulty,q.is_pyq,q.pyq_year,q.pyq_tier,
    lower(p_answers->>q.id::text),
    (p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,
    case when not (p_answers ? q.id::text) then 0
         when lower(p_answers->>q.id::text)=q.correct_option then q.marks
         else -q.negative_marks end,
    (p_answers ? q.id::text)
  from public.quiz_questions q
  where q.id=any(p_question_ids);

  insert into public.daily_activity(user_id,activity_date) values(v_user_id,current_date) on conflict(user_id,activity_date) do nothing;

  return jsonb_build_object('score',round(v_score,2),'max_score',round(v_max_score,2),'correct',v_correct,'wrong',v_wrong,'unanswered',v_total-v_answered,'total',v_total,'results',v_results);
end;
$$;
revoke all on function public.submit_quiz_attempt_v2(uuid,uuid[],jsonb) from public;
grant execute on function public.submit_quiz_attempt_v2(uuid,uuid[],jsonb) to authenticated;

-- Admin-only aggregate analytics. No individual user IDs are returned.
create or replace function public.get_admin_pyq_analytics()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_result jsonb;
begin
  if v_email <> 'jalajsinghal04@gmail.com' then
    raise exception 'Admin access required.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'overview', jsonb_build_object(
      'responses', count(*),
      'answered', count(*) filter(where e.answered),
      'correct', count(*) filter(where e.answered and e.is_correct),
      'wrong', count(*) filter(where e.answered and not e.is_correct),
      'pyq_responses', count(*) filter(where e.is_pyq),
      'pyq_correct', count(*) filter(where e.is_pyq and e.answered and e.is_correct)
    ),
    'topics', coalesce((select jsonb_agg(x order by x.attempts desc, x.accuracy asc) from (
      select coalesce(nullif(trim(e.topic),''),'Uncategorized') as topic,
             count(*) as attempts,
             count(*) filter(where e.answered and e.is_correct) as correct,
             count(*) filter(where e.answered and not e.is_correct) as wrong,
             round(100.0*count(*) filter(where e.answered and e.is_correct)/nullif(count(*) filter(where e.answered),0),1) as accuracy
      from public.quiz_response_events e group by 1
    ) x), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(x order by x.year desc) from (
      select e.pyq_year as year,count(*) as attempts,
             count(*) filter(where e.answered and e.is_correct) as correct,
             round(100.0*count(*) filter(where e.answered and e.is_correct)/nullif(count(*) filter(where e.answered),0),1) as accuracy
      from public.quiz_response_events e where e.is_pyq and e.pyq_year is not null group by e.pyq_year
    ) x), '[]'::jsonb),
    'tiers', coalesce((select jsonb_agg(x order by x.attempts desc) from (
      select coalesce(nullif(trim(e.pyq_tier),''),'Unspecified') as tier,count(*) as attempts,
             count(*) filter(where e.answered and e.is_correct) as correct,
             round(100.0*count(*) filter(where e.answered and e.is_correct)/nullif(count(*) filter(where e.answered),0),1) as accuracy
      from public.quiz_response_events e where e.is_pyq group by 1
    ) x), '[]'::jsonb)
  ) into v_result
  from public.quiz_response_events e;

  return v_result;
end;
$$;
revoke all on function public.get_admin_pyq_analytics() from public;
grant execute on function public.get_admin_pyq_analytics() to authenticated;
