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
