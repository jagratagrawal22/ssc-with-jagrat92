-- ============================================================
-- SSC With Jagrat — UPDATE v15 (Learning Intelligence)
-- Run AFTER database.sql + v9/v10/v11 + v13 security migration.
-- Adds student dashboard data + server-backed Mistake Book.
-- ============================================================

create table if not exists public.quiz_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  chosen_option text,
  correct_option text not null check (correct_option in ('a','b','c','d')),
  explanation text,
  next_review_at timestamptz default now(),
  review_count integer not null default 0,
  created_at timestamptz default now(),
  unique(user_id, question_id)
);

alter table public.quiz_mistakes enable row level security;
drop policy if exists "user reads own quiz mistakes" on public.quiz_mistakes;
create policy "user reads own quiz mistakes" on public.quiz_mistakes
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "user updates own quiz mistakes" on public.quiz_mistakes;
create policy "user updates own quiz mistakes" on public.quiz_mistakes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Students never insert/delete mistakes directly. The quiz RPC maintains them.
revoke insert, delete on public.quiz_mistakes from anon, authenticated;
grant select, update on public.quiz_mistakes to authenticated;

create index if not exists quiz_mistakes_user_due_idx
  on public.quiz_mistakes(user_id, next_review_at);

-- Replace the quiz submission function with a version that also maintains
-- the Mistake Book. Scoring and answer-key access remain server-side.
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
  from public.classes where id = p_class_id and published = true;
  if v_class_no is null then
    raise exception 'Class not found.' using errcode = 'P0002';
  end if;

  v_is_free := coalesce((regexp_match(trim(v_class_no), '[0-9]+'))[1]::int = 1, false);
  if not v_is_free and not exists (
    select 1 from public.subscriptions s
    where s.user_id = v_user_id and s.status = 'active' and s.current_period_end > now()
  ) then
    raise exception 'A subscription is required for this quiz.' using errcode = '42501';
  end if;

  select count(*)::int into v_total from public.quiz_questions q where q.class_id = p_class_id;
  if v_total = 0 then
    raise exception 'This class has no quiz questions.' using errcode = 'P0002';
  end if;

  select count(*)::int,
         count(*) filter (where q.correct_option = lower(coalesce(p_answers ->> q.id::text, '')))::int
  into v_answered, v_score
  from public.quiz_questions q
  where q.class_id = p_class_id and p_answers ? q.id::text;

  if v_answered <> v_total then
    raise exception 'Please answer every question before submitting.' using errcode = '22023';
  end if;

  -- Maintain Mistake Book: wrong answers are upserted; questions answered
  -- correctly later are removed from the book.
  insert into public.quiz_mistakes (
    user_id,class_id,question_id,question,option_a,option_b,option_c,option_d,
    chosen_option,correct_option,explanation,next_review_at,review_count
  )
  select
    v_user_id,q.class_id,q.id,q.question,q.option_a,q.option_b,q.option_c,q.option_d,
    lower(p_answers ->> q.id::text),q.correct_option,q.explanation,now(),0
  from public.quiz_questions q
  where q.class_id = p_class_id
    and lower(coalesce(p_answers ->> q.id::text,'')) <> q.correct_option
  on conflict (user_id,question_id) do update set
    chosen_option = excluded.chosen_option,
    correct_option = excluded.correct_option,
    explanation = excluded.explanation,
    next_review_at = now();

  delete from public.quiz_mistakes m
  where m.user_id = v_user_id and m.class_id = p_class_id
    and exists (
      select 1 from public.quiz_questions q
      where q.id = m.question_id
        and q.correct_option = lower(coalesce(p_answers ->> q.id::text,''))
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'question_id', q.id,
      'chosen_option', lower(p_answers ->> q.id::text),
      'correct_option', q.correct_option,
      'explanation', q.explanation
    ) order by q.sort_order, q.created_at
  ), '[]'::jsonb)
  into v_results
  from public.quiz_questions q where q.class_id = p_class_id;

  insert into public.quiz_attempts (user_id,class_id,score,total)
  values (v_user_id,p_class_id,v_score,v_total);

  insert into public.daily_activity (user_id,activity_date)
  values (v_user_id,current_date)
  on conflict (user_id,activity_date) do nothing;

  return jsonb_build_object('score',v_score,'total',v_total,'results',v_results);
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid,jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid,jsonb) to authenticated;
