-- Brush X cloud sync: one-time setup. Paste this whole file into your Supabase project's SQL editor and run it.
-- Each signed-in person can only see and change their own projects.

-- 1) project list (one row per project; the project file itself lives in Storage)
create table if not exists public.projects (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  updated_at  bigint not null,
  created_at  bigint not null,
  archived    boolean not null default false,
  size        bigint not null default 0,
  thumb       text,
  frames      int not null default 1,
  width       int not null,
  height      int not null,
  fps         int not null default 12
);

create index if not exists projects_owner_idx on public.projects (owner);

alter table public.projects enable row level security;

drop policy if exists "own projects: read"   on public.projects;
drop policy if exists "own projects: insert" on public.projects;
drop policy if exists "own projects: update" on public.projects;
drop policy if exists "own projects: delete" on public.projects;

create policy "own projects: read"   on public.projects for select using (owner = auth.uid());
create policy "own projects: insert" on public.projects for insert with check (owner = auth.uid());
create policy "own projects: update" on public.projects for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own projects: delete" on public.projects for delete using (owner = auth.uid());

-- 2) private file bucket; every file lives under "<user id>/"
insert into storage.buckets (id, name, public, file_size_limit)
values ('brushx', 'brushx', false, 52428800)   -- 50 MB per project file
on conflict (id) do nothing;

drop policy if exists "own files: read"   on storage.objects;
drop policy if exists "own files: insert" on storage.objects;
drop policy if exists "own files: update" on storage.objects;
drop policy if exists "own files: delete" on storage.objects;

create policy "own files: read"   on storage.objects for select using (bucket_id = 'brushx' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: insert" on storage.objects for insert with check (bucket_id = 'brushx' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: update" on storage.objects for update using (bucket_id = 'brushx' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: delete" on storage.objects for delete using (bucket_id = 'brushx' and (storage.foldername(name))[1] = auth.uid()::text);
