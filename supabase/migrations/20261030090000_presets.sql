-- Purpose: Create the shared `presets` table for saved app parameters (issue #61), with
--   row-level security for open, anonymous saves and a simple per-user hourly save limit.
-- Consumers: the Supabase project (paste into the dashboard SQL editor, or `supabase db push`);
--   apps/shared/presets.js reads and writes it through the Data API.
-- Dependencies: Supabase Postgres with the auth schema (auth.users, auth.uid()) and
--   gen_random_uuid(); Anonymous sign-ins enabled for writes (see supabase/README.md).

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  app text not null check (char_length(app) between 1 and 80),
  name text not null check (char_length(name) between 1 and 80),
  note text check (note is null or char_length(note) <= 500),
  params jsonb not null check (jsonb_typeof(params) = 'object' and octet_length(params::text) <= 8192),
  commit_sha text check (commit_sha is null or char_length(commit_sha) <= 64),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade
);

comment on table public.presets is 'Saved app parameter sets (including the seed). Anyone reads; anonymous or signed-in visitors insert and manage their own rows. Moderate in the dashboard.';

create index if not exists presets_app_created_at on public.presets (app, created_at desc);
create index if not exists presets_created_by_created_at on public.presets (created_by, created_at desc);

alter table public.presets enable row level security;

-- Everyone, signed in or not, can read and browse presets.
create policy "presets are readable by everyone" on public.presets
  for select to anon, authenticated using (true);

-- Writes need a session; anonymous sign-ins count (they use the authenticated role).
create policy "visitors insert their own presets" on public.presets
  for insert to authenticated with check (created_by = (select auth.uid()));

create policy "visitors update their own presets" on public.presets
  for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

create policy "visitors delete their own presets" on public.presets
  for delete to authenticated using (created_by = (select auth.uid()));

grant select on public.presets to anon, authenticated;
grant insert, update, delete on public.presets to authenticated;

-- Basic abuse limit: at most 20 saves per user per rolling hour. The client looks for
-- "preset rate limit" in the error message.
create or replace function public.presets_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.presets
      where created_by = new.created_by and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'preset rate limit: at most 20 saves per hour' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.presets_rate_limit() from public, anon, authenticated;

drop trigger if exists presets_rate_limit on public.presets;
create trigger presets_rate_limit before insert on public.presets
  for each row execute function public.presets_rate_limit();
