-- v20: AI Study Assistant support
-- Additive migration. Does not delete or modify existing quiz/class/progress data.
-- AI API credentials MUST stay in Supabase Edge Function secrets, never in frontend code.

create table if not exists public.ai_tutor_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'general',
  mode text not null default 'tutor',
  created_at timestamptz not null default now()
);

alter table public.ai_tutor_usage enable row level security;
drop policy if exists "Users can read own AI usage" on public.ai_tutor_usage;
create policy "Users can read own AI usage" on public.ai_tutor_usage for select to authenticated using (auth.uid() = user_id);

create index if not exists ai_tutor_usage_user_created_idx on public.ai_tutor_usage(user_id, created_at desc);

-- No direct INSERT policy is intentionally provided. The Edge Function may later record usage
-- with a controlled server-side path without allowing clients to fabricate usage records.
revoke all on public.ai_tutor_usage from anon, authenticated;
grant select on public.ai_tutor_usage to authenticated;
