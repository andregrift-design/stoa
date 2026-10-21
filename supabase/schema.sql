-- Run this once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  key        text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),  -- set by the device that made the change
  synced_at  timestamptz not null default now(),  -- set by the server, used to fetch changes
  primary key (user_id, key)
);

create index if not exists docs_user_synced on public.docs (user_id, synced_at);

alter table public.docs enable row level security;

drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();
