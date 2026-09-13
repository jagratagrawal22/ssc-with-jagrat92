-- v25 additive migration: advanced student analytics + progress reporting
-- No existing rows are deleted or modified.
-- Run after database_update_v24_push_notifications.sql.

create table if not exists public.student_report_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  report_name text,
  target_accuracy numeric(5,2) not null default 80 check(target_accuracy between 0 and 100),
  target_questions integer not null default 10 check(target_questions between 1 and 500),
  updated_at timestamptz not null default now()
);

alter table public.student_report_preferences enable row level security;
drop policy if exists student_report_preferences_own on public.student_report_preferences;
create policy student_report_preferences_own on public.student_report_preferences
  for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.student_report_preferences to authenticated;

create or replace function public.get_student_report_summary()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_answered integer:=0; v_correct integer:=0; v_attempts integer:=0; v_classes integer:=0; v_due integer:=0; v_active_days integer:=0;
  v_score numeric:=0; v_max numeric:=0;
  v_streak integer:=0;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select count(*),count(*) filter(where is_correct) into v_answered,v_correct from public.quiz_response_events where user_id=v_user and answered=true;
  select count(*),coalesce(sum(score),0),coalesce(sum(total),0) into v_attempts,v_score,v_max from public.quiz_attempts where user_id=v_user;
  select count(*) into v_classes from public.progress where user_id=v_user;
  select count(*) into v_due from public.quiz_mistakes where user_id=v_user and (next_review_at is null or next_review_at<=now());
  select count(distinct activity_date) into v_active_days from public.daily_activity where user_id=v_user;
  select coalesce(current_streak,0) into v_streak from public.daily_challenge_stats where user_id=v_user;
  return jsonb_build_object('answered',v_answered,'correct',v_correct,'accuracy',case when v_answered>0 then round(v_correct::numeric/v_answered*100,2) else 0 end,'attempts',v_attempts,'score',round(v_score,2),'max_score',round(v_max,2),'classes_completed',v_classes,'revision_due',v_due,'active_days',v_active_days,'challenge_streak',v_streak);
end; $$;
revoke all on function public.get_student_report_summary() from public;
grant execute on function public.get_student_report_summary() to authenticated;
