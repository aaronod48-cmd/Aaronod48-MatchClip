-- =====================================================================
-- Week 1, Step 7b: a parent adds a child, with consent
--
-- Plain-English summary
--   add_child        saves the child, the parent link and the consent in ONE
--                    go. If anything is wrong, nothing is saved. A child can
--                    never exist without a consent record.
--   withdraw_consent the parent withdraws consent; coaches lose access at once.
--   give_consent     the parent gives consent again after withdrawing.
--
-- Checks, all done by the database (not just the screens):
--   - only a logged-in PARENT can add a child, and only for themselves
--   - the consent box must have been ticked
--   - the consent must be to the CURRENT wording (version below)
--   - the child must be under 18 (adults sign up themselves)
--   - at most 10 children per parent (stops misuse)
-- =====================================================================

-- The current consent wording. Must match src/config/consent.ts (a test checks).
create function private.current_consent_version() returns text
language sql immutable set search_path = '' as $$ select 'v1-draft' $$;

create function public.add_child(
  p_first_name text,
  p_birth_year int,
  p_team_name text,
  p_consent_version text,
  p_consent_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  this_year int := extract(year from now())::int;
  new_player uuid;
begin
  if me is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'parent') then
    raise exception 'Only a parent or guardian account can add a child.' using errcode = '42501';
  end if;
  if p_consent_confirmed is not true then
    raise exception 'Consent is needed to add a child.' using errcode = '22023';
  end if;
  if p_consent_version is distinct from private.current_consent_version() then
    raise exception 'The consent wording has changed. Please reload the page and read it again.' using errcode = '22023';
  end if;
  if p_first_name is null or char_length(trim(p_first_name)) not between 1 and 40 then
    raise exception 'Please enter a first name (up to 40 letters).' using errcode = '22023';
  end if;
  -- Youngest possible age must be under 18, and the child at least 3.
  if p_birth_year is null
     or this_year - p_birth_year - 1 >= private.adult_age()
     or this_year - p_birth_year < 3 then
    raise exception 'Please check the birth year. Players aged 18 or over sign up themselves.' using errcode = '22023';
  end if;
  if (select count(*) from public.guardianships where guardian_id = me) >= 10 then
    raise exception 'You can add up to 10 children.' using errcode = '22023';
  end if;

  insert into public.players (first_name, birth_year, team_name, created_by)
  values (trim(p_first_name), p_birth_year, nullif(left(trim(coalesce(p_team_name, '')), 80), ''), me)
  returning id into new_player;

  insert into public.guardianships (guardian_id, player_id) values (me, new_player);

  insert into public.consents (player_id, guardian_id, consent_version)
  values (new_player, me, p_consent_version);

  return new_player;
end;
$$;

create function public.withdraw_consent(p_player uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_guardian_of(p_player) then
    raise exception 'Only this child''s parent or guardian can do that.' using errcode = '42501';
  end if;
  update public.consents
  set withdrawn_at = now()
  where player_id = p_player and withdrawn_at is null;
end;
$$;

create function public.give_consent(p_player uuid, p_consent_version text, p_consent_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_guardian_of(p_player) then
    raise exception 'Only this child''s parent or guardian can do that.' using errcode = '42501';
  end if;
  if p_consent_confirmed is not true then
    raise exception 'Please tick the box to give consent.' using errcode = '22023';
  end if;
  if p_consent_version is distinct from private.current_consent_version() then
    raise exception 'The consent wording has changed. Please reload the page and read it again.' using errcode = '22023';
  end if;
  if not private.has_active_consent(p_player) then
    insert into public.consents (player_id, guardian_id, consent_version)
    values (p_player, (select auth.uid()), p_consent_version);
  end if;
end;
$$;

-- Only logged-in users may call these (and the checks above still apply).
revoke execute on function public.add_child(text, int, text, text, boolean) from public, anon;
revoke execute on function public.withdraw_consent(uuid) from public, anon;
revoke execute on function public.give_consent(uuid, text, boolean) from public, anon;
grant execute on function public.add_child(text, int, text, text, boolean) to authenticated;
grant execute on function public.withdraw_consent(uuid) to authenticated;
grant execute on function public.give_consent(uuid, text, boolean) to authenticated;

revoke execute on function private.current_consent_version() from public, anon;
grant execute on function private.current_consent_version() to authenticated;
