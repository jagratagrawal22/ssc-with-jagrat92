-- SSC With Jagrat database + security
create extension if not exists pgcrypto;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text default '📚',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_no text not null,
  title text not null,
  video_url text,
  video_file_url text,
  practice_url text,
  notes_url text,
  mock_url text,
  thumbnail_url text,
  published boolean default true,
  created_at timestamptz default now()
);

-- If the classes table already existed before this update, this adds the new column safely.
alter table public.classes add column if not exists video_file_url text;

alter table public.subjects enable row level security;
alter table public.classes enable row level security;

drop policy if exists "public read subjects" on public.subjects;
create policy "public read subjects" on public.subjects for select using (true);

drop policy if exists "public read published classes" on public.classes;
create policy "public read published classes" on public.classes for select using (published = true);

-- ADMIN-ONLY policy: only the designated admin email can insert/update/delete.
-- Normal signed-up users remain authenticated but do NOT receive management access.
drop policy if exists "auth manage subjects" on public.subjects;
drop policy if exists "admin manage subjects" on public.subjects;
create policy "admin manage subjects" on public.subjects
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "auth manage classes" on public.classes;
drop policy if exists "admin manage classes" on public.classes;
create policy "admin manage classes" on public.classes
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

insert into public.subjects(name,icon,sort_order) values
('History','🏛️',1),('Geography','🌍',2),('Economics','💰',3),
('Physics','⚡',4),('Chemistry','🧪',5),('Biology','🧬',6),
('Polity','🏛️',7),('Static GK','🌐',8),('Current Affairs','📰',9)
on conflict(name) do nothing;

-- Storage bucket for PDF materials
insert into storage.buckets (id,name,public) values ('materials','materials',true)
on conflict (id) do update set public=true;

drop policy if exists "public read materials" on storage.objects;
create policy "public read materials" on storage.objects for select using (bucket_id='materials');

drop policy if exists "authenticated upload materials" on storage.objects;
drop policy if exists "admin upload materials" on storage.objects;
create policy "admin upload materials" on storage.objects for insert to authenticated
  with check (bucket_id='materials' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "authenticated update materials" on storage.objects;
drop policy if exists "admin update materials" on storage.objects;
create policy "admin update materials" on storage.objects for update to authenticated
  using (bucket_id='materials' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check (bucket_id='materials' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "authenticated delete materials" on storage.objects;
drop policy if exists "admin delete materials" on storage.objects;
create policy "admin delete materials" on storage.objects for delete to authenticated
  using (bucket_id='materials' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

-- Storage bucket for directly uploaded class videos
insert into storage.buckets (id,name,public) values ('videos','videos',true)
on conflict (id) do update set public=true;

drop policy if exists "public read videos" on storage.objects;
create policy "public read videos" on storage.objects for select using (bucket_id='videos');

drop policy if exists "authenticated upload videos" on storage.objects;
drop policy if exists "admin upload videos" on storage.objects;
create policy "admin upload videos" on storage.objects for insert to authenticated
  with check (bucket_id='videos' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "authenticated update videos" on storage.objects;
drop policy if exists "admin update videos" on storage.objects;
create policy "admin update videos" on storage.objects for update to authenticated
  using (bucket_id='videos' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com')
  with check (bucket_id='videos' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

drop policy if exists "authenticated delete videos" on storage.objects;
drop policy if exists "admin delete videos" on storage.objects;
create policy "admin delete videos" on storage.objects for delete to authenticated
  using (bucket_id='videos' and (auth.jwt() ->> 'email') = 'jalajsinghal04@gmail.com');

-- ============================================================
-- PAID SUBSCRIPTION SYSTEM (monthly / yearly, Class 01 always free)
-- ============================================================

-- Subscription plans. Publicly readable so the website can show prices.
-- Change YOUR OWN prices any time by editing amount_paise below (in paise: ₹1 = 100 paise)
-- and re-running just this block, or with:
--   update public.plans set amount_paise = 49900 where id = 'monthly';
create table if not exists public.plans (
  id text primary key,              -- 'monthly' or 'yearly'
  label text not null,
  amount_paise integer not null,
  duration_days integer not null,
  active boolean default true
);
insert into public.plans (id,label,amount_paise,duration_days) values
  ('monthly','Monthly Plan',49900,30),
  ('yearly','Yearly Plan',199900,365)
on conflict (id) do nothing;

alter table public.plans enable row level security;
drop policy if exists "public read plans" on public.plans;
create policy "public read plans" on public.plans for select using (active = true);

-- Student subscriptions. Only ever written by the verify-payment Edge Function
-- (using the service-role key) after a Razorpay payment signature is verified —
-- students cannot insert/update/delete rows here themselves, only read their own.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active',
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paise integer not null,
  current_period_end timestamptz not null,
  created_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "user reads own subscriptions" on public.subscriptions;
create policy "user reads own subscriptions" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

-- Make paid content buckets PRIVATE. Videos/PDFs are now only ever served through
-- the get-media-url Edge Function, which checks "Class 01 = free" or "active
-- subscription" before generating a short-lived (2 hour) signed link.
update storage.buckets set public=false where id in ('materials','videos');

drop policy if exists "public read materials" on storage.objects;
drop policy if exists "public read videos" on storage.objects;
-- Admin upload/update/delete policies on these buckets are unchanged and still work
-- from the admin panel, since the admin is an authenticated user.
