-- SSC With Jagrat — UPDATE v21 (Personalized Learning + Daily Challenge + Smart Notifications)
-- SAFE MIGRATION: additive only. Existing data/files are preserved.
-- Run AFTER database_update_v20_ai_tutor.sql.

create table if not exists public.daily_challenge_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  question_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique(user_id, challenge_date)
);

create table if not exists public.daily_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  attempt_id uuid references public.quiz_attempts(id) on delete set null,
  score numeric not null default 0,
  max_score numeric not null default 0,
  correct integer not null default 0,
  wrong integer not null default 0,
  unanswered integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, challenge_date)
);

create table if not exists public.learning_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_questions integer not null default 10 check(daily_questions between 1 and 100),
  daily_minutes integer not null default 30 check(daily_minutes between 5 and 300),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_challenge_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_challenges integer not null default 0,
  total_points integer not null default 0,
  current_streak integer not null default 0,
  last_challenge_date date,
  updated_at timestamptz not null default now()
);

alter table public.daily_challenge_stats enable row level security;
drop policy if exists "users read own daily challenge stats" on public.daily_challenge_stats;
create policy "users read own daily challenge stats" on public.daily_challenge_stats for select to authenticated using(auth.uid()=user_id);
grant select on public.daily_challenge_stats to authenticated;
revoke all on public.daily_challenge_stats from anon;

alter table public.daily_challenge_assignments enable row level security;
alter table public.daily_challenge_attempts enable row level security;
alter table public.learning_goals enable row level security;

drop policy if exists "users read own daily challenge assignments" on public.daily_challenge_assignments;
create policy "users read own daily challenge assignments" on public.daily_challenge_assignments for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own daily challenge attempts" on public.daily_challenge_attempts;
create policy "users read own daily challenge attempts" on public.daily_challenge_attempts for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own learning goals" on public.learning_goals;
create policy "users read own learning goals" on public.learning_goals for select to authenticated using(auth.uid()=user_id);

grant select on public.daily_challenge_assignments, public.daily_challenge_attempts, public.learning_goals to authenticated;
revoke all on public.daily_challenge_assignments, public.daily_challenge_attempts, public.learning_goals from anon;

create index if not exists daily_challenge_attempts_date_idx on public.daily_challenge_attempts(challenge_date desc);
create index if not exists daily_challenge_assignments_user_idx on public.daily_challenge_assignments(user_id, challenge_date desc);

-- Returns a stable challenge for the authenticated user for the current day.
-- Question answers remain private; only quiz_questions_public fields are returned.
create or replace function public.get_daily_challenge(p_question_count integer default 10)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_date date:=current_date;
  v_count integer:=least(greatest(coalesce(p_question_count,10),5),20);
  v_ids uuid[];
  v_items jsonb;
  v_done boolean:=false;
  v_score numeric:=0;
  v_max numeric:=0;
  v_correct integer:=0;
  v_wrong integer:=0;
  v_unanswered integer:=0;
begin
  if v_user is null then raise exception 'Please log in to use Daily Challenge.' using errcode='42501'; end if;

  select question_ids into v_ids from public.daily_challenge_assignments where user_id=v_user and challenge_date=v_date;
  if v_ids is null then
    select array_agg(x.id order by x.rank, x.id) into v_ids from (
      select q.id,
             row_number() over(order by md5(q.id::text||v_date::text)) as rank
      from public.quiz_questions q
      join public.classes c on c.id=q.class_id and c.published=true
      where q.marks is not null
      limit v_count
    ) x;
    if v_ids is null or cardinality(v_ids)<1 then raise exception 'No quiz questions are available for today.' using errcode='P0002'; end if;
    insert into public.daily_challenge_assignments(user_id,challenge_date,question_ids)
    values(v_user,v_date,v_ids)
    on conflict(user_id,challenge_date) do nothing;
    select question_ids into v_ids from public.daily_challenge_assignments where user_id=v_user and challenge_date=v_date;
  end if;

  select exists(select 1 from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),
         coalesce((select score from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),0),
         coalesce((select max_score from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),0),
         coalesce((select correct from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),0),
         coalesce((select wrong from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),0),
         coalesce((select unanswered from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date),0)
  into v_done,v_score,v_max,v_correct,v_wrong,v_unanswered;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'class_id',q.class_id,'question',q.question,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,
    'topic',q.topic,'difficulty',q.difficulty,'is_pyq',q.is_pyq,'pyq_year',q.pyq_year,'pyq_tier',q.pyq_tier,'marks',q.marks,'negative_marks',q.negative_marks
  ) order by array_position(v_ids,q.id)),'[]'::jsonb)
  into v_items
  from public.quiz_questions_public q where q.id=any(v_ids);

  return jsonb_build_object('challenge_date',v_date,'done',v_done,'questions',v_items,'score',v_score,'max_score',v_max,'correct',v_correct,'wrong',v_wrong,'unanswered',v_unanswered);
end;
$$;
revoke all on function public.get_daily_challenge(integer) from public;
grant execute on function public.get_daily_challenge(integer) to authenticated;

create or replace function public.submit_daily_challenge(p_answers jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid(); v_date date:=current_date; v_ids uuid[]; v_attempt_id uuid; v_challenge_id uuid;
  v_total integer:=0; v_answered integer:=0; v_correct integer:=0; v_wrong integer:=0;
  v_score numeric:=0; v_max numeric:=0; v_results jsonb:='[]'::jsonb;
begin
  if v_user is null then raise exception 'Please log in.' using errcode='42501'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Invalid challenge submission.' using errcode='22023'; end if;
  if exists(select 1 from public.daily_challenge_attempts where user_id=v_user and challenge_date=v_date) then raise exception 'Today''s challenge has already been submitted.' using errcode='23505'; end if;
  select question_ids into v_ids from public.daily_challenge_assignments where user_id=v_user and challenge_date=v_date;
  if v_ids is null then raise exception 'Open today''s challenge first.' using errcode='P0002'; end if;

  select count(*)::int,count(*) filter(where p_answers ? q.id::text)::int,
         count(*) filter(where p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option)::int,
         count(*) filter(where p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option)::int,
         coalesce(sum(q.marks),0)::numeric,
         coalesce(sum(case when not(p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end),0)::numeric
  into v_total,v_answered,v_correct,v_wrong,v_max,v_score
  from public.quiz_questions q where q.id=any(v_ids);

  if v_total<>cardinality(v_ids) then raise exception 'Challenge questions are no longer available.' using errcode='22023'; end if;

  insert into public.quiz_attempts(user_id,class_id,score,total,attempt_type,exam_name,duration_seconds,question_count,submitted_at)
  values(v_user,(select q.class_id from public.quiz_questions q where q.id=v_ids[1]),round(v_score,2),round(v_max,2),'daily_challenge','Daily Challenge',0,v_total,now())
  returning id into v_attempt_id;

  insert into public.daily_challenge_attempts(user_id,challenge_date,attempt_id,score,max_score,correct,wrong,unanswered)
  values(v_user,v_date,v_attempt_id,round(v_score,2),round(v_max,2),v_correct,v_wrong,v_total-v_answered)
  returning id into v_challenge_id;

  insert into public.quiz_mistakes(user_id,class_id,question_id,question,option_a,option_b,option_c,option_d,chosen_option,correct_option,explanation,next_review_at,review_count)
  select v_user,q.class_id,q.id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,lower(p_answers->>q.id::text),q.correct_option,q.explanation,now(),0
  from public.quiz_questions q where q.id=any(v_ids) and lower(coalesce(p_answers->>q.id::text,''))<>q.correct_option
  on conflict(user_id,question_id) do update set chosen_option=excluded.chosen_option,correct_option=excluded.correct_option,explanation=excluded.explanation,next_review_at=now();

  delete from public.quiz_mistakes m where m.user_id=v_user and m.question_id=any(v_ids)
    and exists(select 1 from public.quiz_questions q where q.id=m.question_id and q.correct_option=lower(coalesce(p_answers->>m.question_id::text,'')));

  insert into public.quiz_response_events(user_id,attempt_id,class_id,question_id,topic,difficulty,is_pyq,pyq_year,pyq_tier,chosen_option,is_correct,marks_awarded,answered)
  select v_user,v_attempt_id,q.class_id,q.id,q.topic,q.difficulty,q.is_pyq,q.pyq_year,q.pyq_tier,lower(p_answers->>q.id::text),
    (p_answers ? q.id::text) and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,
    case when not(p_answers ? q.id::text) then 0 when lower(p_answers->>q.id::text)=q.correct_option then q.marks else -q.negative_marks end,
    (p_answers ? q.id::text) from public.quiz_questions q where q.id=any(v_ids);

  insert into public.daily_activity(user_id,activity_date) values(v_user,v_date) on conflict(user_id,activity_date) do nothing;
  insert into public.daily_challenge_stats(user_id,total_challenges,total_points,current_streak,last_challenge_date) values(v_user,1,greatest(0,round(v_score*5)::int)+v_correct*2,1,v_date)
  on conflict(user_id) do update set total_challenges=public.daily_challenge_stats.total_challenges+1,total_points=public.daily_challenge_stats.total_points+(greatest(0,round(v_score*5)::int)+v_correct*2),current_streak=case when public.daily_challenge_stats.last_challenge_date=v_date-1 then public.daily_challenge_stats.current_streak+1 when public.daily_challenge_stats.last_challenge_date=v_date then public.daily_challenge_stats.current_streak else 1 end,last_challenge_date=v_date,updated_at=now();
  select coalesce(jsonb_agg(jsonb_build_object('question_id',q.id,'chosen_option',lower(p_answers->>q.id::text),'correct_option',q.correct_option,'explanation',q.explanation,'is_correct',p_answers ? q.id::text and lower(coalesce(p_answers->>q.id::text,''))=q.correct_option,'answered',p_answers ? q.id::text) order by array_position(v_ids,q.id)),'[]'::jsonb) into v_results from public.quiz_questions q where q.id=any(v_ids);
  return jsonb_build_object('attempt_id',v_attempt_id,'score',round(v_score,2),'max_score',round(v_max,2),'correct',v_correct,'wrong',v_wrong,'unanswered',v_total-v_answered,'results',v_results,'challenge_points',greatest(0,round(v_score*5)::int)+v_correct*2);
end;
$$;
revoke all on function public.submit_daily_challenge(jsonb) from public;
grant execute on function public.submit_daily_challenge(jsonb) to authenticated;

create or replace function public.set_learning_goal(p_daily_questions integer, p_daily_minutes integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_q integer:=least(greatest(coalesce(p_daily_questions,10),1),100); v_m integer:=least(greatest(coalesce(p_daily_minutes,30),5),300);
begin if v_user is null then raise exception 'Please log in.' using errcode='42501'; end if;
insert into public.learning_goals(user_id,daily_questions,daily_minutes) values(v_user,v_q,v_m) on conflict(user_id) do update set daily_questions=excluded.daily_questions,daily_minutes=excluded.daily_minutes,updated_at=now();
return jsonb_build_object('daily_questions',v_q,'daily_minutes',v_m); end; $$;
revoke all on function public.set_learning_goal(integer,integer) from public; grant execute on function public.set_learning_goal(integer,integer) to authenticated;

-- Personalized next-action engine. It uses private response events for the logged-in user only.
create or replace function public.get_personalized_learning_path()
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_due integer; v_mistakes integer; v_quizzes integer; v_completed integer; v_challenge_done boolean; v_weak jsonb; v_next jsonb; v_goal jsonb;
begin
  if v_user is null then raise exception 'Please log in.' using errcode='42501'; end if;
  select count(*) into v_due from public.quiz_mistakes where user_id=v_user and next_review_at<=now();
  select count(*) into v_mistakes from public.quiz_mistakes where user_id=v_user;
  select count(*) into v_quizzes from public.quiz_attempts where user_id=v_user;
  select count(*) into v_completed from public.progress where user_id=v_user;
  select exists(select 1 from public.daily_challenge_attempts where user_id=v_user and challenge_date=current_date) into v_challenge_done;
  select coalesce(jsonb_agg(x order by x.accuracy asc,x.answered desc),'[]'::jsonb) into v_weak from (
    select coalesce(nullif(trim(topic),''),'General') topic,count(*) filter(where answered)::int answered,
           round(100.0*count(*) filter(where answered and is_correct)/nullif(count(*) filter(where answered),0),1) accuracy
    from public.quiz_response_events where user_id=v_user group by 1 having count(*) filter(where answered)>=2 order by accuracy asc limit 5
  ) x;
  select row_to_json(g)::jsonb into v_goal from (select daily_questions,daily_minutes from public.learning_goals where user_id=v_user) g;
  if not v_challenge_done then v_next:=jsonb_build_object('type','daily_challenge','title','Complete today''s Daily Challenge','reason','Build consistency and earn XP.','href','daily-challenge.html');
  elsif v_due>0 then v_next:=jsonb_build_object('type','revision','title','Clear your revision queue','reason',v_due||' questions are due for review.','href','revision.html');
  elsif jsonb_array_length(v_weak)>0 then v_next:=jsonb_build_object('type','weak_topic','title','Practice your weakest topic','reason',(v_weak->0->>'topic')||' is currently your lowest-accuracy area.','href','ai-study-assistant.html');
  else v_next:=jsonb_build_object('type','practice','title','Take a focused practice quiz','reason','Keep your daily momentum going.','href','exam-simulator.html'); end if;
  return jsonb_build_object('due_reviews',v_due,'mistakes',v_mistakes,'quizzes',v_quizzes,'classes_completed',v_completed,'challenge_done',v_challenge_done,'weak_topics',v_weak,'next_action',v_next,'goal',coalesce(v_goal,jsonb_build_object('daily_questions',10,'daily_minutes',30)));
end;
$$;
revoke all on function public.get_personalized_learning_path() from public;
grant execute on function public.get_personalized_learning_path() to authenticated;

-- Aggregate daily-challenge leaderboard; no user IDs are exposed.
create or replace function public.get_daily_challenge_leaderboard(p_limit integer default 20)
returns jsonb
language sql security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.score desc,x.correct desc),'[]'::jsonb) from (
    select coalesce(nullif(trim(p.display_name),''),'Student') as display_name,
           d.score,d.max_score,d.correct,d.wrong
    from public.daily_challenge_attempts d
    left join public.profiles p on p.id=d.user_id
    where d.challenge_date=current_date
    order by d.score desc,d.correct desc
    limit least(greatest(coalesce(p_limit,20),1),50)
  ) x;
$$;
revoke all on function public.get_daily_challenge_leaderboard(integer) from public;
grant execute on function public.get_daily_challenge_leaderboard(integer) to authenticated;
