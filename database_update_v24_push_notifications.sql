-- v24 additive migration: real Web Push subscriptions + preferences
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions for select to authenticated using (auth.uid()=user_id);
create policy push_subscriptions_own_insert on public.push_subscriptions for insert to authenticated with check (auth.uid()=user_id);
create policy push_subscriptions_own_update on public.push_subscriptions for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (auth.uid()=user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  revision_due boolean not null default true,
  daily_challenge boolean not null default true,
  unfinished_classes boolean not null default true,
  weak_topic_practice boolean not null default true,
  streak_protection boolean not null default true,
  daily_goal boolean not null default true,
  result_updates boolean not null default true,
  reminder_time time not null default '19:00',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own_all on public.notification_preferences;
create policy notification_preferences_own_all on public.notification_preferences for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select, insert, update, delete on public.notification_preferences to authenticated;

create or replace function public.get_notification_preferences()
returns public.notification_preferences
language plpgsql security definer set search_path=public
as $$
declare r public.notification_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select * into r from public.notification_preferences where user_id=auth.uid();
  return r;
end; $$;

grant execute on function public.get_notification_preferences() to authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device_label text default null, p_user_agent text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_endpoint),0)=0 or coalesce(length(p_p256dh),0)=0 or coalesce(length(p_auth),0)=0 then raise exception 'Invalid push subscription'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,device_label,user_agent,last_seen_at)
  values(auth.uid(),p_endpoint,p_p256dh,p_auth,p_device_label,p_user_agent,now())
  on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,device_label=excluded.device_label,user_agent=excluded.user_agent,last_seen_at=now();
  insert into public.notification_preferences(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  return true;
end; $$;
grant execute on function public.save_push_subscription(text,text,text,text,text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
  return true;
end; $$;
grant execute on function public.delete_push_subscription(text) to authenticated;

create or replace function public.save_notification_preferences(p_enabled boolean, p_revision_due boolean, p_daily_challenge boolean, p_unfinished_classes boolean, p_weak_topic_practice boolean, p_streak_protection boolean, p_daily_goal boolean, p_result_updates boolean, p_reminder_time time, p_quiet_start time, p_quiet_end time, p_timezone text)
returns public.notification_preferences language plpgsql security definer set search_path=public as $$
declare r public.notification_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id,enabled,revision_due,daily_challenge,unfinished_classes,weak_topic_practice,streak_protection,daily_goal,result_updates,reminder_time,quiet_start,quiet_end,timezone,updated_at)
  values(auth.uid(),p_enabled,p_revision_due,p_daily_challenge,p_unfinished_classes,p_weak_topic_practice,p_streak_protection,p_daily_goal,p_result_updates,p_reminder_time,p_quiet_start,p_quiet_end,coalesce(nullif(p_timezone,''),'Asia/Kolkata'),now())
  on conflict(user_id) do update set enabled=excluded.enabled,revision_due=excluded.revision_due,daily_challenge=excluded.daily_challenge,unfinished_classes=excluded.unfinished_classes,weak_topic_practice=excluded.weak_topic_practice,streak_protection=excluded.streak_protection,daily_goal=excluded.daily_goal,result_updates=excluded.result_updates,reminder_time=excluded.reminder_time,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone,updated_at=now();
  select * into r from public.notification_preferences where user_id=auth.uid(); return r;
end; $$;
grant execute on function public.save_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,time,text) to authenticated;
