-- =====================================================================
-- Week 1, Step 7c: a parent invites their teen (13-17) to their own login
--
-- Plain-English summary
--   check_teen_invite  the parent's request is checked BEFORE any email is
--                      sent: own parent, child is definitely 13-17, consent
--                      active, and no login yet.
--   link_teen_login    after the invite is created, joins the new login to the
--                      child. Only the server (with the secret key) can run it,
--                      and it repeats every check.
--   is_player_self     now also needs active parental consent for under-18s,
--                      so withdrawing consent closes the teen's own access too.
-- =====================================================================

-- Definitely old enough for their own login (we only know the birth year,
-- so use the youngest possible age), and still under 18.
create function private.can_have_own_login(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select extract(year from now())::int - p.birth_year - 1 >= private.own_login_min_age()
       from public.players p where p.id = p_player),
    false)
  and private.is_minor(p_player)
$$;

create function public.check_teen_invite(p_player uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  child public.players;
begin
  if not private.is_guardian_of(p_player) then
    raise exception 'Only this child''s parent or guardian can do that.' using errcode = '42501';
  end if;
  select * into child from public.players where id = p_player;
  if not private.can_have_own_login(p_player) then
    raise exception 'Only children aged % to % can have their own login.',
      private.own_login_min_age(), private.adult_age() - 1 using errcode = '22023';
  end if;
  if not private.has_active_consent(p_player) then
    raise exception 'Please give consent first.' using errcode = '22023';
  end if;
  if child.user_id is not null then
    raise exception '% already has their own login.', child.first_name using errcode = '22023';
  end if;
  return child.first_name;
end;
$$;

-- Server only: called with the secret key after the invite is created.
create function public.link_teen_login(p_player uuid, p_user uuid, p_guardian uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.guardianships where player_id = p_player and guardian_id = p_guardian) then
    raise exception 'Not this child''s guardian.' using errcode = '42501';
  end if;
  if not private.can_have_own_login(p_player) or not private.has_active_consent(p_player) then
    raise exception 'This child can''t have their own login right now.' using errcode = '22023';
  end if;
  if exists (select 1 from public.players where user_id = p_user) then
    raise exception 'That login already belongs to a player.' using errcode = '22023';
  end if;

  update public.players set user_id = p_user where id = p_player and user_id is null;
  if not found then
    raise exception 'This child already has their own login.' using errcode = '22023';
  end if;
  -- The teen's login is always a player login.
  update public.profiles set role = 'player' where id = p_user;
end;
$$;

revoke execute on function public.check_teen_invite(uuid) from public, anon;
grant execute on function public.check_teen_invite(uuid) to authenticated;
revoke execute on function public.link_teen_login(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_teen_login(uuid, uuid, uuid) to service_role;
revoke execute on function private.can_have_own_login(uuid) from public, anon;
grant execute on function private.can_have_own_login(uuid) to authenticated;

-- A teen only sees their own record while a parent's consent is active.
create or replace function private.is_player_self(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players
    where id = p_player and user_id = (select auth.uid())
  )
  and (not private.is_minor(p_player) or private.has_active_consent(p_player))
$$;
