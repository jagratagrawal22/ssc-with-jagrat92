-- SSC With Jagrat — UPDATE v18 (Exam Simulator)
-- SAFE MIGRATION: additive only. Existing data/files are preserved.
-- Run AFTER database_update_v17_pyq_intelligence.sql.

alter table public.quiz_attempts add column if not exists attempt_type text not null default 'class_quiz';
alter table public.quiz_attempts add column if not exists exam_name text;
alter table public.quiz_attempts add column if not exists duration_seconds integer;
alter table public.quiz_attempts add column if not exists question_count integer;
alter table public.quiz_attempts add column if not exists submitted_at timestamptz;

create index if not exists quiz_attempts_type_idx on public.quiz_attempts(user_id, attempt_type, created_at desc);

-- SSC-style mock submission. Answers and scoring stay server-side.
create or replace function public.submit_exam_mock(
  p_question_ids uuid[],
  p_answers jsonb,
  p_exam_name text default 'SSC GK/GS Mock',
  p_duration_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_total integer:=0; v_answered integer:=0; v_correct integer:=0; v_wrong integer:=0;
  v_score numeric:=0; v_max_score numeric:=0; v_attempt_id uuid; v_results jsonb:='[]'::jsonb;
  v_class_id uuid;
begin
  if v_user_id is null then raise exception 'Please log in to submit the mock.' using errcode='42501'; end if;
  if p_question_ids is null or cardinality(p_question_ids)<1 or p_answers is null or jsonb_typeof(p_answers)<>'object' then
    raise exception 'Invalid mock submission.' using errcode='22023';
  end if;
  if not exists(select 1 from public.subscriptions s where s.user_id=v_user_id and s.status='active' and s.current_period_end>now()) then
    raise exception 'An active subscription is required for the Exam Simulator.' using errcode='42501';
  end if;

  select min(q.class_id) into v_class_id
  from public.quiz_questions q
  join public.classes c on c.id=q.class_id and c.published=true
  where q.id=any(p_question_ids);

  select count(*)::int,
         count(*) filter(where p_answers ? q.id::text)::int,
         count(*) filter(where p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option)::int,
         count(*) filter(where p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option)::int,
         coalesce(sum(q.marks),0)::numeric,
         coalesce(sum(case when not (p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end),0)::numeric
  into v_total,v_answered,v_correct,v_wrong,v_max_score,v_score
  from public.quiz_questions q
  join public.classes c on c.id=q.class_id and c.published=true
  where q.id=any(p_question_ids);

  if v_total<>cardinality(p_question_ids) or v_class_id is null then
    raise exception 'One or more mock questions are invalid.' using errcode='22023';
  end if;

  insert into public.quiz_attempts(user_id,class_id,score,total,attempt_type,exam_name,duration_seconds,question_count,submitted_at)
  values(v_user_id,v_class_id,round(v_score,2),round(v_max_score,2),'exam_mock',left(coalesce(p_exam_name,'SSC GK/GS Mock'),120),greatest(coalesce(p_duration_seconds,0),0),v_total,now())
  returning id into v_attempt_id;

  insert into public.quiz_mistakes(user_id,class_id,question_id,question,option_a,option_b,option_c,option_d,chosen_option,correct_option,explanation,next_review_at,review_count)
  select v_user_id,q.class_id,q.id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,lower(p_answers->>q.id::text),q.correct_option,q.explanation,now(),0
  from public.quiz_questions q where q.id=any(p_question_ids)
    and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option
  on conflict(user_id,question_id) do update set chosen_option=excluded.chosen_option,correct_option=excluded.correct_option,explanation=excluded.explanation,next_review_at=now();

  delete from public.quiz_mistakes m where m.user_id=v_user_id and m.question_id=any(p_question_ids)
    and exists(select 1 from public.quiz_questions q where q.id=m.question_id and q.correct_option=lower(coalesce(p_answers->>m.question_id::text,'')));

  insert into public.quiz_response_events(user_id,attempt_id,class_id,question_id,topic,difficulty,is_pyq,pyq_year,pyq_tier,chosen_option,is_correct,marks_awarded,answered)
  select v_user_id,v_attempt_id,q.class_id,q.id,q.topic,q.difficulty,q.is_pyq,q.pyq_year,q.pyq_tier,
    lower(p_answers->>q.id::text),
    (p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,
    case when not (p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end,
    (p_answers ? q.id::text)
  from public.quiz_questions q where q.id=any(p_question_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'chosen_option',lower(p_answers->>q.id::text),'correct_option',q.correct_option,
    'explanation',q.explanation,'marks',q.marks,'negative_marks',q.negative_marks,
    'is_correct',p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,
    'answered',p_answers ? q.id::text
  ) order by q.sort_order,q.created_at),'[]'::jsonb) into v_results
  from public.quiz_questions q where q.id=any(p_question_ids);

  insert into public.daily_activity(user_id,activity_date) values(v_user_id,current_date) on conflict(user_id,activity_date) do nothing;
  return jsonb_build_object('attempt_id',v_attempt_id,'score',round(v_score,2),'max_score',round(v_max_score,2),'correct',v_correct,'wrong',v_wrong,'unanswered',v_total-v_answered,'total',v_total,'results',v_results);
end;
$$;
revoke all on function public.submit_exam_mock(uuid[],jsonb,text,integer) from public;
grant execute on function public.submit_exam_mock(uuid[],jsonb,text,integer) to authenticated;
