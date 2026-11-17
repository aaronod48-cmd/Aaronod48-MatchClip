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
