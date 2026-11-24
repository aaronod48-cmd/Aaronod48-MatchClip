-- ============================================================
-- ONE-OFF: creates the Week 1 tables and access rules (Steps 3 and 4)
-- in the real Supabase database. Paste into Supabase SQL Editor and Run.
-- Safe: it all happens in one go, or not at all if anything goes wrong.
-- It also records these changes as done, so they're never applied twice.
-- ============================================================
begin;

-- ---------- from supabase/migrations/20261117000000_week1_core_tables.sql ----------
-- =====================================================================
-- Week 1, Step 3: core tables
--
-- Plain-English summary
--   profiles             one row per login (parent, adult player, teen player, coach, admin)
--   players              one row per footballer; under-13s have NO login (user_id is empty)
--   guardianships        which parent/guardian looks after which player
--   consents             record of each consent a parent gave (and if they withdrew it)
--   organisations        who provides coaching; today just "independent", later clubs
--   organisation_members which coaches/admins belong to which organisation
--   coach_assignments    which coach reviews which player (coaches only see these players)
--   staff_access_log     every time staff open a minor's video (filled in from Week 2)
--   tags                 clip tags, starting with the owner's list
--
-- SAFETY: row-level security is switched ON for every table here, with no
-- access rules yet. That means nobody can read or write anything through the
-- app until Step 4 adds the rules on purpose. Locked by default.
-- =====================================================================

-- ---------- Types ----------------------------------------------------

create type public.app_role as enum ('parent', 'player', 'coach', 'admin');
create type public.organisation_kind as enum ('independent', 'club', 'academy');
create type public.organisation_member_role as enum ('coach', 'admin');
create type public.guardian_relationship as enum ('parent', 'guardian');
create type public.tag_source as enum ('ai', 'coach');

-- ---------- Helpers --------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles -------------------------------------------------
-- One per login. Deleting the login deletes the profile.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.app_role not null default 'parent',
  display_name text check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- When someone signs up, create their profile.
-- Sign-up can only ever make a 'parent' or an adult 'player'.
-- Coach and admin can NEVER come from sign-up; only an admin can grant them.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'account_type';
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    case when requested = 'player' then 'player'::public.app_role
         else 'parent'::public.app_role end,
    left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- players --------------------------------------------------
-- The footballer. Collect only what's needed: first name and birth YEAR.
-- No full date of birth, no address, no school, no location.

create table public.players (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null, -- empty for under-13s
  first_name  text not null check (char_length(trim(first_name)) between 1 and 40),
  birth_year  smallint not null check (birth_year between 1900 and 2100),
  team_name   text check (char_length(team_name) <= 80),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger players_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ---------- guardianships --------------------------------------------

create table public.guardianships (
  guardian_id  uuid not null references public.profiles (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  relationship public.guardian_relationship not null default 'parent',
  created_at   timestamptz not null default now(),
  primary key (guardian_id, player_id)
);

create index guardianships_player_idx on public.guardianships (player_id);

-- If the last parent/guardian of a player WITHOUT their own login is removed
-- (for example the parent deletes their account), delete the player too.
-- Nothing is left behind with nobody responsible for it.
create function public.delete_orphaned_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.players p
  where p.id = old.player_id
    and p.user_id is null
    and not exists (select 1 from public.guardianships g where g.player_id = old.player_id);
  return old;
end;
$$;

create trigger guardianships_cleanup
  after delete on public.guardianships
  for each row execute function public.delete_orphaned_player();

-- ---------- consents -------------------------------------------------
-- A permanent record of each consent: who agreed, for which child,
-- to which version of the wording, and when. Withdrawing sets withdrawn_at.

create table public.consents (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players (id) on delete cascade,
  guardian_id     uuid references public.profiles (id) on delete set null,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  given_at        timestamptz not null default now(),
  withdrawn_at    timestamptz,
  check (withdrawn_at is null or withdrawn_at >= given_at)
);

create index consents_player_idx on public.consents (player_id);

-- ---------- organisations (club-ready) --------------------------------

create table public.organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 120),
  kind       public.organisation_kind not null default 'club',
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  member_role     public.organisation_member_role not null default 'coach',
  created_at      timestamptz not null default now(),
  primary key (organisation_id, profile_id)
);

create index organisation_members_profile_idx on public.organisation_members (profile_id);

-- At launch there is one coach (the owner), working independently.
insert into public.organisations (name, kind) values ('Independent coaching', 'independent');

-- ---------- coach_assignments ----------------------------------------
-- A coach only ever sees players assigned to them here.
-- Ending an assignment keeps the history but removes access.

create table public.coach_assignments (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.profiles (id) on delete cascade,
  player_id       uuid not null references public.players (id) on delete cascade,
  organisation_id uuid references public.organisations (id) on delete set null,
  assigned_by     uuid references public.profiles (id) on delete set null,
  assigned_at     timestamptz not null default now(),
  ended_at        timestamptz,
  check (ended_at is null or ended_at >= assigned_at)
);

-- A coach can have only one active assignment per player.
create unique index coach_assignments_one_active
  on public.coach_assignments (coach_id, player_id) where ended_at is null;
create index coach_assignments_player_idx on public.coach_assignments (player_id);

-- ---------- staff_access_log -----------------------------------------
-- Every time staff (coach/admin) open a minor's video or clip.
-- Rows are never edited. If the player is deleted, the row stays
-- but no longer points to them.

create table public.staff_access_log (
  id          bigint generated always as identity primary key,
  staff_id    uuid references public.profiles (id) on delete set null,
  player_id   uuid references public.players (id) on delete set null,
  action      text not null check (char_length(action) between 1 and 60),
  target_type text check (char_length(target_type) <= 40),
  target_id   uuid,
  accessed_at timestamptz not null default now()
);

create index staff_access_log_player_idx on public.staff_access_log (player_id, accessed_at desc);

-- ---------- tags -----------------------------------------------------
-- The list of tags. Linking tags to clips (and recording ai vs coach)
-- comes in Week 2 with the clips table; tag_source is ready for it.

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(trim(name)) between 1 and 40),
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.tags (name, sort_order) values
  ('Beaten 1v1', 1),
  ('Passing', 2),
  ('Duels', 3),
  ('First touch', 4),
  ('Positioning', 5),
  ('Defending', 6),
  ('Transition', 7);

-- ---------- Lock everything by default --------------------------------

alter table public.profiles             enable row level security;
alter table public.players              enable row level security;
alter table public.guardianships        enable row level security;
alter table public.consents             enable row level security;
alter table public.organisations        enable row level security;
alter table public.organisation_members enable row level security;
alter table public.coach_assignments    enable row level security;
alter table public.staff_access_log     enable row level security;
alter table public.tags                 enable row level security;

-- The helper functions are for the database's own use, not callable from the app.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.delete_orphaned_player() from public, anon, authenticated;

-- ---------- from supabase/migrations/20261117010000_week1_access_rules.sql ----------
-- =====================================================================
-- Week 1, Step 4: who can see and change what (row-level security)
--
-- Plain-English summary
--   Visitors who aren't logged in: nothing at all.
--   Parent:  their own profile, their own children, their children's
--            consents, coach assignments and staff-access log.
--            Can edit and delete their children.
--   Player:  their own profile and player record only.
--   Coach:   only players actively assigned to them. For under-18s, only
--            while a parent's consent is active. Read-only.
--   Admin:   manages accounts, roles and coach assignments. Does NOT get
--            automatic access to children's videos (Week 2); an admin
--            can be assigned as a coach like anyone else.
--   Nobody:  can change their own role, edit or delete the access log,
--            or create children/consents directly (that goes through a
--            checked function in Step 7).
-- =====================================================================

-- Helper functions live in a "private" schema the app can't call directly.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- Age rules (must match src/config/age-rules.ts) -------------
-- A test checks these numbers are the same as the app's config file.

create function private.own_login_min_age() returns int
language sql immutable set search_path = '' as $$ select 13 $$;

create function private.adult_age() returns int
language sql immutable set search_path = '' as $$ select 18 $$;

-- Uses the YOUNGER possible age (we only store birth year), so a child is
-- never treated as older than they might be.
create function private.is_minor(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select extract(year from now())::int - p.birth_year - 1 < private.adult_age()
       from public.players p where p.id = p_player),
    true)  -- unknown player: treat as a minor (the safe answer)
$$;

-- ---------- Who is the current user? -----------------------------------

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

create function private.is_guardian_of(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardianships
    where player_id = p_player and guardian_id = (select auth.uid())
  )
$$;

create function private.is_player_self(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players
    where id = p_player and user_id = (select auth.uid())
  )
$$;

create function private.has_active_consent(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents
    where player_id = p_player and withdrawn_at is null
  )
$$;

-- A coach (or admin acting as coach) with an active assignment.
-- For under-18s the parent's consent must also be active.
create function private.is_assigned_coach(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.coach_assignments a
    join public.profiles pr on pr.id = a.coach_id
    where a.player_id = p_player
      and a.coach_id = (select auth.uid())
      and a.ended_at is null
      and pr.role in ('coach', 'admin')
  )
  and (not private.is_minor(p_player) or private.has_active_consent(p_player))
$$;

-- The one question most rules ask: can this person see this player?
-- (Admins are handled separately in each rule, on purpose.)
create function private.can_view_player(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_guardian_of(p_player)
      or private.is_player_self(p_player)
      or private.is_assigned_coach(p_player)
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------- Base permissions -------------------------------------------
-- Visitors who aren't logged in get nothing on any table.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Logged-in users never get TRUNCATE (row-level security doesn't cover it).
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Only some columns can be edited at all.
revoke update on public.profiles from authenticated;
grant update (display_name, role) on public.profiles to authenticated; -- role: admins only (trigger below)

revoke update on public.players from authenticated;
grant update (first_name, birth_year, team_name) on public.players to authenticated;

-- ---------- profiles ---------------------------------------------------

create policy "profiles: see own, admin sees all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

create policy "profiles: edit own, admin edits any"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());

-- Only an admin can change anyone's role (including their own).
create function private.guard_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null      -- a real logged-in user, not the system
     and not private.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function private.guard_role_change();

-- ---------- players ----------------------------------------------------
-- No insert rule: children are added through a checked function (Step 7).

create policy "players: see if guardian, self, assigned coach or admin"
  on public.players for select to authenticated
  using (private.can_view_player(id) or private.is_admin());

create policy "players: guardian or adult self can edit"
  on public.players for update to authenticated
  using (private.is_guardian_of(id) or (private.is_player_self(id) and not private.is_minor(id)))
  with check (private.is_guardian_of(id) or (private.is_player_self(id) and not private.is_minor(id)));

create policy "players: guardian or admin can delete"
  on public.players for delete to authenticated
  using (private.is_guardian_of(id) or private.is_admin());

-- ---------- guardianships ----------------------------------------------

create policy "guardianships: see own links"
  on public.guardianships for select to authenticated
  using (guardian_id = (select auth.uid())
         or private.is_player_self(player_id)
         or private.is_admin());

-- ---------- consents ---------------------------------------------------
-- Created and withdrawn through checked functions (Step 7).

create policy "consents: guardians and admin can see"
  on public.consents for select to authenticated
  using (private.is_guardian_of(player_id) or private.is_admin());

-- ---------- organisations ----------------------------------------------

create policy "organisations: logged-in users can see names"
  on public.organisations for select to authenticated
  using (true);

create policy "organisations: admin manages"
  on public.organisations for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy "organisation_members: see own, admin sees all"
  on public.organisation_members for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_admin());

create policy "organisation_members: admin manages"
  on public.organisation_members for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------- coach_assignments ------------------------------------------

create policy "coach_assignments: coach, guardian, player and admin can see"
  on public.coach_assignments for select to authenticated
  using (coach_id = (select auth.uid())
         or private.is_guardian_of(player_id)
         or private.is_player_self(player_id)
         or private.is_admin());

create policy "coach_assignments: admin creates"
  on public.coach_assignments for insert to authenticated
  with check (private.is_admin());

create policy "coach_assignments: admin edits"
  on public.coach_assignments for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy "coach_assignments: admin deletes"
  on public.coach_assignments for delete to authenticated
  using (private.is_admin());

-- ---------- staff_access_log -------------------------------------------
-- Read-only for everyone. Rows are added by the system (Week 2).
-- Parents can see who opened their child's videos.

revoke insert, update, delete on public.staff_access_log from authenticated;

create policy "staff_access_log: guardians and admin can see"
  on public.staff_access_log for select to authenticated
  using ((player_id is not null and private.is_guardian_of(player_id)) or private.is_admin());

-- ---------- tags -------------------------------------------------------

create policy "tags: logged-in users can see"
  on public.tags for select to authenticated
  using (true);

create policy "tags: admin manages"
  on public.tags for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------- record these changes as applied ----------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261117000000', 'week1_core_tables') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261117010000', 'week1_access_rules') on conflict (version) do nothing;

commit;
