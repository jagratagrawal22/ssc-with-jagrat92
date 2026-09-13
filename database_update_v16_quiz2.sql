-- SSC With Jagrat — UPDATE v16 (Quiz 2.0)
-- SAFE MIGRATION: additive only. Existing subjects, classes, questions,
-- attempts, subscriptions and user data are preserved.
-- Run AFTER database_update_v15_learning.sql.

alter table public.quiz_questions add column if not exists topic text;
alter table public.quiz_questions add column if not exists difficulty text default 'medium';
alter table public.quiz_questions add column if not exists is_pyq boolean not null default false;
alter table public.quiz_questions add column if not exists pyq_year integer;
alter table public.quiz_questions add column if not exists pyq_tier text;
alter table public.quiz_questions add column if not exists marks numeric not null default 2;
alter table public.quiz_questions add column if not exists negative_marks numeric not null default 0.5;

-- Keep old data valid while allowing richer Quiz 2.0 metadata.
update public.quiz_questions set difficulty='medium' where difficulty is null or difficulty='';
update public.quiz_questions set marks=2 where marks is null or marks<=0;
update public.quiz_questions set negative_marks=0.5 where negative_marks is null or negative_marks<0;


-- Quiz 2.0 supports 0.5 negative marking, so retain all historical values
-- while widening score/total from integer to numeric.
alter table public.quiz_attempts alter column score type numeric using score::numeric;
alter table public.quiz_attempts alter column total type numeric using total::numeric;

create index if not exists quiz_questions_topic_idx on public.quiz_questions(class_id, topic);
create index if not exists quiz_questions_difficulty_idx on public.quiz_questions(class_id, difficulty);
create index if not exists quiz_questions_pyq_idx on public.quiz_questions(class_id, is_pyq, pyq_year);

-- Rebuild the safe public quiz view with metadata, still excluding answers.
drop view if exists public.quiz_questions_public;
create view public.quiz_questions_public as
select q.id,q.class_id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,q.sort_order,
       q.topic,q.difficulty,q.is_pyq,q.pyq_year,q.pyq_tier,q.marks,q.negative_marks
from public.quiz_questions q
join public.classes c on c.id=q.class_id
where c.published=true;
grant select on public.quiz_questions_public to anon, authenticated;

-- Selected-question submission for Quiz 2.0. The server verifies that every
-- requested ID belongs to the published class and calculates scoring privately.
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
    and exists(select 1 from public.quiz_questions q where q.id=m.question_id and q.correct_option=lower(coalesce(p_answers->>q.id::text,'')));

  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'chosen_option',lower(p_answers->>q.id::text),'correct_option',q.correct_option,
    'explanation',q.explanation,'marks',q.marks,'negative_marks',q.negative_marks,
    'is_correct',lower(p_answers->>q.id::text)=q.correct_option
  ) order by q.sort_order,q.created_at),'[]'::jsonb) into v_results
  from public.quiz_questions q where q.id=any(p_question_ids);

  insert into public.quiz_attempts(user_id,class_id,score,total) values(v_user_id,p_class_id,round(v_score,2),round(v_max_score,2));
  insert into public.daily_activity(user_id,activity_date) values(v_user_id,current_date) on conflict(user_id,activity_date) do nothing;

  return jsonb_build_object('score',round(v_score,2),'max_score',round(v_max_score,2),'correct',v_correct,'wrong',v_wrong,'unanswered',v_total-v_answered,'total',v_total,'results',v_results);
end;
$$;
revoke all on function public.submit_quiz_attempt_v2(uuid,uuid[],jsonb) from public;
grant execute on function public.submit_quiz_attempt_v2(uuid,uuid[],jsonb) to authenticated;
