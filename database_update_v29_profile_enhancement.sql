-- SSC With Jagrat — v29 Profile Enhancement
-- Run AFTER database_update_v27_subscription_entitlements.sql.
-- Adds student profile fields and a private/public avatar bucket.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists exam_target text,
  add column if not exists study_goal text,
  add column if not exists updated_at timestamptz default now();

-- Keep profile writes restricted to the logged-in owner.
drop policy if exists "user manages own profile" on public.profiles;
create policy "user manages own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;

-- Avatar storage: public read is intentional so leaderboard/profile images can render.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar owner insert" on storage.objects;
create policy "avatar owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
