-- Step 4 checks: every role tries to see and change things.
-- Anything they shouldn't reach must be blocked by the DATABASE itself.
--
-- The pretend people:
--   Parent A   children: Sam (A1, consent given), Alex (A2, NO consent), Taylor (teen, own login)
--   Parent B   child: Billie (B1, consent given)
--   Pat        adult player with own login
--   Coach C    assigned to Sam, Alex and Pat
--   Coach D    assigned to Billie
--   Admin X
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------- helper: pretend to be a logged-in person ----------
create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

-- ---------- set up the pretend people (as the system) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'parent.a@test.local', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'parent.b@test.local', '{}'),
  ('cccccccc-0000-0000-0000-000000000001', 'pat@test.local',      '{"account_type":"player"}'),
  ('dddddddd-0000-0000-0000-000000000001', 'taylor@test.local',   '{"account_type":"player"}'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'coach.c@test.local',  '{}'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'coach.d@test.local',  '{}'),
  ('ffffffff-0000-0000-0000-000000000001', 'admin.x@test.local',  '{}');

update public.profiles set role = 'coach' where id in
  ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002');
update public.profiles set role = 'admin' where id = 'ffffffff-0000-0000-0000-000000000001';

insert into public.players (id, user_id, first_name, birth_year) values
  ('11111111-0000-0000-0000-0000000000a1', null, 'Sam',    2016),
  ('11111111-0000-0000-0000-0000000000a2', null, 'Alex',   2015),
  ('11111111-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-000000000001', 'Taylor', 2011),
  ('11111111-0000-0000-0000-0000000000b1', null, 'Billie', 2016),
  ('11111111-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000001', 'Pat', 1995);

insert into public.guardianships (guardian_id, player_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a2'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a3'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000b1');

insert into public.consents (player_id, guardian_id, consent_version) values
  ('11111111-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'v1-draft'),
  ('11111111-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'v1-draft'),
  ('11111111-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', 'v1-draft');

insert into public.coach_assignments (coach_id, player_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1'),
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a2'),
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000c1'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000b1');

insert into public.staff_access_log (staff_id, player_id, action) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1', 'view_video'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000b1', 'view_video');

-- How many accounts exist in total (counted as the system, for the admin check).
create table tests.account_count as select count(*)::int as n from auth.users;
grant select on tests.account_count to authenticated;

-- ===================== Not logged in =====================
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  0, 'visitors who are not logged in have no access to any table');

-- ===================== Parent A =====================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

select results_eq(
  'select first_name from public.players order by first_name',
  array['Alex', 'Sam', 'Taylor'],
  'Parent A sees only their own three children');
select is((select count(*)::int from public.profiles), 1,
  'Parent A sees only their own profile');
select is((select count(*)::int from public.consents), 2,
  'Parent A sees only their own children''s consents');
select is((select count(*)::int from public.coach_assignments), 2,
  'Parent A sees the coach assignments for their children');
select is((select count(*)::int from public.staff_access_log), 1,
  'Parent A sees who opened their child''s video, and nobody else''s');

update public.players set first_name = 'Sammy' where id = '11111111-0000-0000-0000-0000000000a1';
select is((select first_name from public.players where id = '11111111-0000-0000-0000-0000000000a1'),
  'Sammy', 'Parent A can edit their child''s name');

select throws_ok(
  $$update public.players set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    where id = '11111111-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'Parent A cannot attach a login to a child directly');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null, 'Parent A cannot make themselves an admin');
select throws_ok(
  $$update public.profiles set role = 'coach' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null, 'Parent A cannot make themselves a coach');
select throws_ok(
  $$insert into public.players (first_name, birth_year) values ('Sneaky', 2015)$$,
  '42501', null, 'Parent A cannot add a child without the consent step');
select throws_ok(
  $$insert into public.consents (player_id, consent_version)
    values ('11111111-0000-0000-0000-0000000000a2', 'fake')$$,
  '42501', null, 'Parent A cannot write a consent record directly');
select throws_ok(
  $$insert into public.coach_assignments (coach_id, player_id)
    values ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'Parent A cannot assign a coach');
select throws_ok(
  $$insert into public.staff_access_log (action) values ('fake')$$,
  '42501', null, 'Parent A cannot write to the access log');
select throws_ok(
  $$insert into public.tags (name) values ('Fake tag')$$,
  '42501', null, 'Parent A cannot add tags');
select is((select count(*)::int from public.tags), 10, 'Parent A can read the tag list');

-- ===================== Parent B =====================
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');

select results_eq('select first_name from public.players', array['Billie'],
  'Parent B sees only their own child');
-- These must silently do nothing (checked further down as the system):
update public.players set first_name = 'Hacked' where id = '11111111-0000-0000-0000-0000000000a1';
delete from public.players where id = '11111111-0000-0000-0000-0000000000a1';

-- ===================== Taylor (teen, own login) =====================
select tests.login('dddddddd-0000-0000-0000-000000000001');

select results_eq('select first_name from public.players', array['Taylor'],
  'Taylor (teen) sees only their own record, not their siblings');
select is((select count(*)::int from public.consents), 0,
  'Taylor cannot see consent records');
update public.players set first_name = 'Changed' where id = '11111111-0000-0000-0000-0000000000a3';

-- ===================== Pat (adult player) =====================
select tests.login('cccccccc-0000-0000-0000-000000000001');

select results_eq('select first_name from public.players', array['Pat'],
  'Pat (adult) sees only their own record');
update public.players set team_name = 'Riverside FC' where id = '11111111-0000-0000-0000-0000000000c1';
select is((select team_name from public.players where id = '11111111-0000-0000-0000-0000000000c1'),
  'Riverside FC', 'Pat (adult) can edit their own record');

-- ===================== Coach C =====================
select tests.login('eeeeeeee-0000-0000-0000-000000000001');

select results_eq('select first_name from public.players order by first_name',
  array['Pat', 'Sammy'],
  'Coach C sees only assigned players with consent (not Alex: no consent; not Billie or Taylor: not assigned)');
select is((select count(*)::int from public.consents), 0, 'Coach C cannot see consent records');
select is((select count(*)::int from public.profiles), 1, 'Coach C sees only their own profile');
update public.players set first_name = 'CoachEdit' where id = '11111111-0000-0000-0000-0000000000a1';

-- ===================== Coach D =====================
select tests.login('eeeeeeee-0000-0000-0000-000000000002');

select results_eq('select first_name from public.players', array['Billie'],
  'Coach D sees only Billie');
select is((select count(*)::int from public.staff_access_log), 0,
  'Coach D cannot read the access log');

-- ===================== Admin X =====================
select tests.login('ffffffff-0000-0000-0000-000000000001');

select is((select count(*)::int from public.profiles),
  (select n from tests.account_count), 'Admin sees every account');
update public.profiles set role = 'coach' where id = 'cccccccc-0000-0000-0000-000000000001';
select is((select role::text from public.profiles where id = 'cccccccc-0000-0000-0000-000000000001'),
  'coach', 'Admin can change someone''s role');
select lives_ok(
  $$insert into public.coach_assignments (coach_id, player_id)
    values ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000a2')$$,
  'Admin can assign a coach');
select throws_ok(
  $$delete from public.staff_access_log$$,
  '42501', null, 'Even an admin cannot delete the access log');

-- ===================== Changes take effect immediately =====================
reset role;
update public.consents set withdrawn_at = now()
  where player_id = '11111111-0000-0000-0000-0000000000a1';
update public.coach_assignments set ended_at = now()
  where coach_id = 'eeeeeeee-0000-0000-0000-000000000001'
    and player_id = '11111111-0000-0000-0000-0000000000c1';

select tests.login('eeeeeeee-0000-0000-0000-000000000001');
select is((select count(*)::int from public.players), 0,
  'Coach C loses access when consent is withdrawn and when an assignment ends');

-- ===================== Parent A deletes a child =====================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.players where id = '11111111-0000-0000-0000-0000000000a2';

-- ===================== Check the blocked attempts really did nothing =====================
reset role;
select is((select first_name from public.players where id = '11111111-0000-0000-0000-0000000000a1'),
  'Sammy', 'Parent B and Coach C could not rename Parent A''s child');
select is((select count(*)::int from public.players where id = '11111111-0000-0000-0000-0000000000a1'),
  1, 'Parent B could not delete Parent A''s child');
select is((select first_name from public.players where id = '11111111-0000-0000-0000-0000000000a3'),
  'Taylor', 'Taylor (a minor) could not change their own record; a parent does that');
select is((select count(*)::int from public.players where id = '11111111-0000-0000-0000-0000000000a2'),
  0, 'Parent A could delete their own child');
select is((select count(*)::int from public.coach_assignments
            where player_id = '11111111-0000-0000-0000-0000000000a2'),
  0, 'and the child''s coach assignments went with it');

-- ===================== Age rules match the app =====================
select is(private.own_login_min_age(), 13, 'database own-login age is 13 (same as src/config/age-rules.ts)');
select is(private.adult_age(), 18, 'database adult age is 18 (same as src/config/age-rules.ts)');

select * from finish();
rollback;
