-- Purpose: Turn `presets` into `cloud_simulator_presets`, one row per emoji rating tap (issue #61):
--   rename the table and its columns (app -> app_id, name -> display_name), add a required
--   `rating` (love, beautiful, gross or boring) and an optional `thumbnail` of the canvas (an image
--   data URL up to 50 KB), rename the indexes and policies, and replace the
--   20-per-hour save limit with 120 taps per user per hour.
-- Consumers: the Supabase project, applied by supabase/apply-migrations.mjs (the Supabase migrations workflow);
--   apps/shared/presets.js reads, inserts and deletes rows through the Data API.
-- Dependencies: 20261030090000_presets.sql (the table, policies and trigger it changes); Supabase
--   Postgres with auth.uid(); Anonymous sign-ins enabled for writes (see supabase/README.md).
-- Safe to re-run: each rename checks first, and the rest is create-or-replace or drop-and-recreate.
-- Rows saved before this migration keep a null rating; the constraint is NOT VALID, so it checks
-- only new and edited rows.

alter table if exists public.presets rename to cloud_simulator_presets;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'cloud_simulator_presets' and column_name = 'app') then
    alter table public.cloud_simulator_presets rename column app to app_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'cloud_simulator_presets' and column_name = 'name') then
    alter table public.cloud_simulator_presets rename column name to display_name;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cloud_simulator_presets_rating_check') then
    alter table public.cloud_simulator_presets add column if not exists rating text;
    alter table public.cloud_simulator_presets add constraint cloud_simulator_presets_rating_check
      check (rating is not null and rating in ('love', 'beautiful', 'gross', 'boring')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cloud_simulator_presets_thumbnail_check') then
    alter table public.cloud_simulator_presets add column if not exists thumbnail text;
    alter table public.cloud_simulator_presets add constraint cloud_simulator_presets_thumbnail_check
      check (thumbnail is null or (char_length(thumbnail) <= 51200 and thumbnail ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$'));
  end if;
end;
$$;

comment on table public.cloud_simulator_presets is 'One row per emoji rating tap in a cloud simulator page: who (display_name), how it felt (rating) and the full settings (params). Anyone reads; anonymous or signed-in visitors insert and delete their own rows. Moderate in the dashboard.';
comment on column public.cloud_simulator_presets.app_id is 'The page, for example cloud-simulator/convection.';
comment on column public.cloud_simulator_presets.display_name is 'The name the visitor typed; not verified.';
comment on column public.cloud_simulator_presets.rating is 'love (heart), beautiful (painting), gross (barf) or boring (gray square). Null only on rows saved before ratings.';
comment on column public.cloud_simulator_presets.params is 'Everything needed to replay the run: all controls, the view, resolution and seed.';
comment on column public.cloud_simulator_presets.thumbnail is 'A small PNG or WebP data URL of the canvas at the moment of the tap (at most 50 KB), or null.';
comment on column public.cloud_simulator_presets.note is 'Unused since ratings replaced named presets; kept for older rows.';

alter index if exists public.presets_app_created_at rename to cloud_simulator_presets_app_id_created_at;
alter index if exists public.presets_created_by_created_at rename to cloud_simulator_presets_created_by_created_at;
create index if not exists cloud_simulator_presets_app_id_created_at on public.cloud_simulator_presets (app_id, created_at desc);
create index if not exists cloud_simulator_presets_created_by_created_at on public.cloud_simulator_presets (created_by, created_at desc);

-- Policies moved with the table; recreate them under clearer names. Ratings are not edited
-- (tap again instead), so there is no update policy.
alter table public.cloud_simulator_presets enable row level security;
drop policy if exists "presets are readable by everyone" on public.cloud_simulator_presets;
drop policy if exists "visitors insert their own presets" on public.cloud_simulator_presets;
drop policy if exists "visitors update their own presets" on public.cloud_simulator_presets;
drop policy if exists "visitors delete their own presets" on public.cloud_simulator_presets;

drop policy if exists "ratings are readable by everyone" on public.cloud_simulator_presets;
create policy "ratings are readable by everyone" on public.cloud_simulator_presets
  for select to anon, authenticated using (true);

drop policy if exists "visitors insert their own ratings" on public.cloud_simulator_presets;
create policy "visitors insert their own ratings" on public.cloud_simulator_presets
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "visitors delete their own ratings" on public.cloud_simulator_presets;
create policy "visitors delete their own ratings" on public.cloud_simulator_presets
  for delete to authenticated using (created_by = (select auth.uid()));

revoke update on public.cloud_simulator_presets from anon, authenticated;
grant select on public.cloud_simulator_presets to anon, authenticated;
grant insert, delete on public.cloud_simulator_presets to authenticated;

-- Abuse limit: at most 120 taps per user per rolling hour. The client looks for
-- "rate limit" in the error message.
create or replace function public.cloud_simulator_presets_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.cloud_simulator_presets
      where created_by = new.created_by and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'rating rate limit: at most 120 per hour' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.cloud_simulator_presets_rate_limit() from public, anon, authenticated;

drop trigger if exists presets_rate_limit on public.cloud_simulator_presets;
drop trigger if exists cloud_simulator_presets_rate_limit on public.cloud_simulator_presets;
create trigger cloud_simulator_presets_rate_limit before insert on public.cloud_simulator_presets
  for each row execute function public.cloud_simulator_presets_rate_limit();
drop function if exists public.presets_rate_limit();

-- Let the Data API see the renamed table right away.
notify pgrst, 'reload schema';
