-- v27: Advanced subscriptions + server-side entitlements. ADDITIVE / NON-DESTRUCTIVE.
-- Existing plans, subscriptions, users, attempts and content are preserved.

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  razorpay_order_id text not null unique,
  amount_paise integer not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed','cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.payment_orders enable row level security;
drop policy if exists payment_orders_own_select on public.payment_orders;
create policy payment_orders_own_select on public.payment_orders for select to authenticated using (auth.uid()=user_id);
grant select on public.payment_orders to authenticated;

alter table public.plans add column if not exists tier text not null default 'pro';
alter table public.plans add column if not exists features jsonb not null default '{}'::jsonb;
update public.plans set tier='pro', features=jsonb_build_object(
 'all_classes', true, 'question_bank', true, 'exam_simulator', true, 'smart_revision', true,
 'advanced_analytics', true, 'ai_tutor', true, 'daily_challenge', true
) where tier is null or features='{}'::jsonb;

create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_sub public.subscriptions%rowtype; v_plan public.plans%rowtype;
begin
 if v_user is null then return jsonb_build_object('authenticated',false,'active',false,'tier','free','features','{}'::jsonb); end if;
 select * into v_sub from public.subscriptions where user_id=v_user and status='active' and current_period_end>now() order by current_period_end desc limit 1;
 if not found then return jsonb_build_object('authenticated',true,'active',false,'tier','free','plan_id',null,'expires_at',null,'features',jsonb_build_object('class_01',true)); end if;
 select * into v_plan from public.plans where id=v_sub.plan_id;
 return jsonb_build_object('authenticated',true,'active',true,'tier',coalesce(v_plan.tier,'pro'),'plan_id',v_sub.plan_id,'plan_label',v_plan.label,'expires_at',v_sub.current_period_end,'features',coalesce(v_plan.features,'{}'::jsonb)||jsonb_build_object('class_01',true));
end $$;
grant execute on function public.get_my_entitlements() to authenticated;

create or replace function public.has_feature(p_feature text)
returns boolean language sql security definer set search_path=public as $$
 select coalesce((public.get_my_entitlements()->'features'->>p_feature)::boolean,false);
$$;
grant execute on function public.has_feature(text) to authenticated;

-- Server-side helper for creating a payment-order record. The client never gets to choose amount/currency.
create or replace function public.create_payment_order_record(p_plan_id text, p_razorpay_order_id text, p_amount_paise integer, p_currency text default 'INR')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_plan public.plans%rowtype; v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=p_plan_id and active=true;
 if not found then raise exception 'Plan is not available'; end if;
 if p_amount_paise<>v_plan.amount_paise or p_currency<>'INR' then raise exception 'Payment order amount mismatch'; end if;
 insert into public.payment_orders(user_id,plan_id,razorpay_order_id,amount_paise,currency) values(v_user,v_plan.id,p_razorpay_order_id,p_amount_paise,p_currency) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.create_payment_order_record(text,text,integer,text) to authenticated;

-- Admin-only aggregate subscription dashboard; no customer IDs returned.
create or replace function public.get_admin_subscription_analytics()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_email text:=lower(coalesce(auth.jwt()->>'email','')); v_total bigint; v_active bigint; v_revenue numeric; v_plans jsonb;
begin
 if v_email<>'jalajsinghal04@gmail.com' then raise exception 'Admin access required' using errcode='42501'; end if;
 select count(*), count(*) filter(where status='active' and current_period_end>now()), coalesce(sum(amount_paise) filter(where status='active'),0) into v_total,v_active,v_revenue from public.subscriptions;
 select coalesce(jsonb_agg(x order by x.plan_id),'[]'::jsonb) into v_plans from (select plan_id,count(*) total,count(*) filter(where status='active' and current_period_end>now()) active,coalesce(sum(amount_paise),0) revenue from public.subscriptions group by plan_id) x;
 return jsonb_build_object('total_subscriptions',v_total,'active_subscriptions',v_active,'gross_recorded_revenue_paise',v_revenue,'plans',v_plans);
end $$;
grant execute on function public.get_admin_subscription_analytics() to authenticated;

-- Prevent duplicate activation through the same Razorpay order/payment IDs.
create unique index if not exists subscriptions_razorpay_order_uidx on public.subscriptions(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists subscriptions_razorpay_payment_uidx on public.subscriptions(razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists subscriptions_user_expiry_idx on public.subscriptions(user_id,status,current_period_end desc);
