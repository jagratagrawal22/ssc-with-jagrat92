-- SSC With Jagrat — UPDATE v19 (Smart Revision + Spaced Repetition)
-- SAFE MIGRATION: additive only. Existing data/files are preserved.
-- Run AFTER database_update_v18_exam_simulator.sql.

create table if not exists public.revision_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mistake_id uuid not null references public.quiz_mistakes(id) on delete cascade,
  rating text not null check (rating in ('hard','remembered','easy')),
  interval_days integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists revision_events_user_idx on public.revision_review_events(user_id, created_at desc);

alter table public.revision_review_events enable row level security;
drop policy if exists "users read own revision events" on public.revision_review_events;
create policy "users read own revision events" on public.revision_review_events
  for select using (auth.uid() = user_id);
revoke all on public.revision_review_events from anon, authenticated;
grant select on public.revision_review_events to authenticated;

create table if not exists public.revision_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_reviews integer not null default 0,
  points integer not null default 0,
  current_streak integer not null default 0,
  last_review_date date,
  updated_at timestamptz not null default now()
);

alter table public.revision_stats enable row level security;
drop policy if exists "users read own revision stats" on public.revision_stats;
create policy "users read own revision stats" on public.revision_stats
  for select using (auth.uid() = user_id);
revoke all on public.revision_stats from anon, authenticated;
grant select on public.revision_stats to authenticated;

-- Due queue. The RPC returns only the authenticated user's mistakes.
create or replace function public.get_revision_queue(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_items jsonb; v_due integer; v_total integer; v_points integer; v_streak integer;
begin
  if v_user is null then raise exception 'Please log in to use Smart Revision.' using errcode='42501'; end if;
  select count(*) into v_due from public.quiz_mistakes where user_id=v_user and next_review_at<=now();
  select count(*) into v_total from public.quiz_mistakes where user_id=v_user;
  select coalesce(points,0),coalesce(current_streak,0) into v_points,v_streak from public.revision_stats where user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'class_id',m.class_id,'question_id',m.question_id,'question',m.question,
    'option_a',m.option_a,'option_b',m.option_b,'option_c',m.option_c,'option_d',m.option_d,
    'chosen_option',m.chosen_option,'correct_option',m.correct_option,'explanation',m.explanation,
    'review_count',m.review_count,'next_review_at',m.next_review_at,'topic',q.topic,
    'difficulty',q.difficulty,'is_pyq',q.is_pyq,'pyq_year',q.pyq_year,'pyq_tier',q.pyq_tier
  ) order by m.next_review_at asc, m.created_at asc), '[]'::jsonb)
  into v_items
  from (select * from public.quiz_mistakes where user_id=v_user and next_review_at<=now() order by next_review_at asc, created_at asc limit v_limit) m
  left join public.quiz_questions q on q.id=m.question_id;
  return jsonb_build_object('items',v_items,'due_count',v_due,'total_mistakes',v_total,'points',v_points,'streak',v_streak);
end;
$$;
revoke all on function public.get_revision_queue(integer) from public;
grant execute on function public.get_revision_queue(integer) to authenticated;

create or replace function public.submit_revision_review(p_mistake_id uuid, p_rating text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_rating text:=lower(coalesce(p_rating,'')); v_m public.quiz_mistakes%rowtype; v_days integer; v_points integer; v_streak integer; v_today date:=current_date; v_last date;
begin
  if v_user is null then raise exception 'Please log in.' using errcode='42501'; end if;
  if v_rating not in ('hard','remembered','easy') then raise exception 'Invalid revision rating.' using errcode='22023'; end if;
  select * into v_m from public.quiz_mistakes where id=p_mistake_id and user_id=v_user for update;
  if not found then raise exception 'Revision item not found.' using errcode='22023'; end if;
  v_days:=case v_rating when 'hard' then 1 when 'remembered' then greatest(3, least(14, power(2, greatest(v_m.review_count,0))::int)) else greatest(7, least(30, power(2, greatest(v_m.review_count+1,1))::int)) end;
  update public.quiz_mistakes set next_review_at=now() + make_interval(days=>v_days), review_count=coalesce(review_count,0)+1 where id=v_m.id;
  insert into public.revision_review_events(user_id,mistake_id,rating,interval_days) values(v_user,v_m.id,v_rating,v_days);
  select last_review_date,current_streak,points into v_last,v_streak,v_points from public.revision_stats where user_id=v_user for update;
  if not found then v_last:=null; v_streak:=0; v_points:=0; insert into public.revision_stats(user_id) values(v_user); end if;
  if v_last is null then v_streak:=1;
  elsif v_last=v_today then v_streak:=coalesce(v_streak,0);
  elsif v_last=v_today-1 then v_streak:=coalesce(v_streak,0)+1;
  else v_streak:=1; end if;
  v_points:=coalesce(v_points,0) + case v_rating when 'hard' then 5 when 'remembered' then 10 else 15 end;
  update public.revision_stats set total_reviews=coalesce(total_reviews,0)+1, points=v_points,current_streak=v_streak,last_review_date=v_today,updated_at=now() where user_id=v_user;
  insert into public.daily_activity(user_id,activity_date) values(v_user,v_today) on conflict(user_id,activity_date) do nothing;
  return jsonb_build_object('ok',true,'next_review_at',now()+make_interval(days=>v_days),'interval_days',v_days,'points',v_points,'streak',v_streak);
end;
$$;
revoke all on function public.submit_revision_review(uuid,text) from public;
grant execute on function public.submit_revision_review(uuid,text) to authenticated;
