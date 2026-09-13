-- SSC With Jagrat — UPDATE v22 (Question Bank + Advanced Practice Engine)
-- SAFE / ADDITIVE: existing questions, attempts, subscriptions, progress and files are preserved.
-- Run AFTER database_update_v21_personalized_learning.sql.

-- Secure question-bank retrieval. The old public quiz view remains for class quiz compatibility;
-- this RPC is the secure path for the new central question bank and never returns paid questions to guests.
create or replace function public.get_question_bank_v22()
returns setof jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user_id uuid:=auth.uid(); v_has_sub boolean:=false;
begin
  if v_user_id is not null then
    v_has_sub:=exists(select 1 from public.subscriptions s where s.user_id=v_user_id and s.status='active' and s.current_period_end>now());
  end if;
  return query
  select jsonb_build_object('id',q.id,'class_id',q.class_id,'class_no',c.class_no,'class_title',c.title,
    'subject_name',s.name,'question',q.question,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,
    'topic',q.topic,'difficulty',coalesce(q.difficulty,'medium'),'is_pyq',q.is_pyq,'pyq_year',q.pyq_year,'pyq_tier',q.pyq_tier,
    'marks',q.marks,'negative_marks',q.negative_marks)
  from public.quiz_questions q join public.classes c on c.id=q.class_id join public.subjects s on s.id=c.subject_id
  where c.published=true and (coalesce((regexp_match(trim(c.class_no),'[0-9]+'))[1]::int=1,false) or v_has_sub)
  order by s.sort_order,c.created_at,q.sort_order,q.created_at;
end;$$;
revoke all on function public.get_question_bank_v22() from public;
grant execute on function public.get_question_bank_v22() to anon,authenticated;

-- Mixed-class custom practice submission. Scores are calculated privately and response events are logged.
create or replace function public.submit_practice_session_v22(p_question_ids uuid[],p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_total int; v_answered int; v_correct int; v_wrong int; v_score numeric; v_max numeric; v_percent numeric; v_attempt uuid; v_results jsonb;
begin
 if v_user is null then raise exception 'Please log in to submit practice.' using errcode='42501'; end if;
 if p_question_ids is null or cardinality(p_question_ids)<1 or cardinality(p_question_ids)>100 or p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Invalid practice session.' using errcode='22023'; end if;
 if exists(select 1 from public.quiz_questions q join public.classes c on c.id=q.class_id where q.id=any(p_question_ids) and not coalesce((regexp_match(trim(c.class_no),'[0-9]+'))[1]::int=1,false) and not exists(select 1 from public.subscriptions s where s.user_id=v_user and s.status='active' and s.current_period_end>now())) then raise exception 'A subscription is required for one or more selected questions.' using errcode='42501'; end if;
 select count(*)::int,count(*) filter(where p_answers ? q.id::text)::int,count(*) filter(where p_answers ? q.id::text and lower(p_answers->>q.id::text)=q.correct_option)::int,count(*) filter(where p_answers ? q.id::text and lower(p_answers->>q.id::text)<>q.correct_option)::int,coalesce(sum(q.marks),0),coalesce(sum(case when not(p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end),0)
 into v_total,v_answered,v_correct,v_wrong,v_max,v_score from public.quiz_questions q join public.classes c on c.id=q.class_id where q.id=any(p_question_ids) and c.published=true;
 if v_total<>cardinality(p_question_ids) then raise exception 'One or more selected questions are unavailable.' using errcode='22023'; end if;
 insert into public.quiz_attempts(user_id,class_id,score,total) select v_user,q.class_id,0,0 from public.quiz_questions q where q.id=p_question_ids[1] returning id into v_attempt;
 insert into public.quiz_response_events(user_id,attempt_id,class_id,question_id,topic,difficulty,is_pyq,pyq_year,pyq_tier,chosen_option,is_correct,marks_awarded,answered)
 select v_user,v_attempt,q.class_id,q.id,q.topic,q.difficulty,q.is_pyq,q.pyq_year,q.pyq_tier,lower(p_answers->>q.id::text),(p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,case when not(p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end,(p_answers ? q.id::text) from public.quiz_questions q where q.id=any(p_question_ids);
 insert into public.quiz_mistakes(user_id,class_id,question_id,question,option_a,option_b,option_c,option_d,chosen_option,correct_option,explanation,next_review_at,review_count)
 select v_user,q.class_id,q.id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,lower(p_answers->>q.id::text),q.correct_option,q.explanation,now(),0 from public.quiz_questions q where q.id=any(p_question_ids) and (p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option on conflict(user_id,question_id) do update set chosen_option=excluded.chosen_option,next_review_at=now();
 delete from public.quiz_mistakes m where m.user_id=v_user and m.question_id=any(p_question_ids) and exists(select 1 from public.quiz_questions q where q.id=m.question_id and p_answers ? q.id::text and lower(p_answers->>q.id::text)=q.correct_option);
 update public.quiz_attempts set score=round(v_score,2),total=round(v_max,2) where id=v_attempt;
 v_percent:=case when v_max>0 then greatest(0,round(v_score/v_max*100,1)) else 0 end;
 select coalesce(jsonb_agg(jsonb_build_object('question_id',q.id,'chosen_option',lower(p_answers->>q.id::text),'correct_option',q.correct_option,'explanation',q.explanation,'is_correct',(p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option) order by q.created_at),'[]'::jsonb) into v_results from public.quiz_questions q where q.id=any(p_question_ids);
 insert into public.daily_activity(user_id,activity_date) values(v_user,current_date) on conflict(user_id,activity_date) do nothing;
 return jsonb_build_object('score',round(v_score,2),'max_score',round(v_max,2),'correct',v_correct,'wrong',v_wrong,'unanswered',v_total-v_answered,'percent',v_percent,'total',v_total,'results',v_results);
end;$$;
revoke all on function public.submit_practice_session_v22(uuid[],jsonb) from public;
grant execute on function public.submit_practice_session_v22(uuid[],jsonb) to authenticated;
