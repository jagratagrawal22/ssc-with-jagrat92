-- v42: Admin-granted free subscriptions. ADDITIVE / NON-DESTRUCTIVE.
-- Lets the verified admin grant full Pro access to any registered user for 1, 6, or 12 months.

insert into public.plans (id,label,amount_paise,duration_days,active,tier,features)
values (
  'admin_free',
  'Admin Free Access',
  0,
  365,
  true,
  'pro',
  jsonb_build_object(
    'all_classes', true,
    'question_bank', true,
    'exam_simulator', true,
    'smart_revision', true,
    'advanced_analytics', true,
    'ai_tutor', true,
    'daily_challenge', true
  )
)
on conflict (id) do update set
  label=excluded.label,
  amount_paise=excluded.amount_paise,
  active=true,
  tier=excluded.tier,
  features=excluded.features;

create or replace function public.grant_free_subscription(p_email text, p_months integer)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_admin_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_existing_end timestamptz;
  v_subscription_id uuid;
begin
  if v_admin_email <> 'jalajsinghal04@gmail.com' then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  if v_email = '' then
    raise exception 'Student email is required';
  end if;

  if p_months not in (1,6,12) then
    raise exception 'Duration must be 1, 6, or 12 months';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email)=v_email
  limit 1;

  if v_user_id is null then
    raise exception 'No registered user found with this email';
  end if;

  select max(current_period_end) into v_existing_end
  from public.subscriptions
  where user_id=v_user_id
    and status='active'
    and current_period_end>now();

  v_start := greatest(now(), coalesce(v_existing_end, now()));
  v_end := v_start + make_interval(months => p_months);

  insert into public.subscriptions(
    user_id, plan_id, status, razorpay_order_id, razorpay_payment_id,
    amount_paise, current_period_end
  ) values (
    v_user_id, 'admin_free', 'active', null, null, 0, v_end
  ) returning id into v_subscription_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'user_id', v_user_id,
    'email', v_email,
    'expires_at', v_end,
    'months', p_months
  );
end;
$$;

grant execute on function public.grant_free_subscription(text,integer) to authenticated;
