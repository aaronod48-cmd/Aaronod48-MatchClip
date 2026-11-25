-- Step 7c checks: only the right parent can invite the right child, and a
-- teen's own access follows the parent's consent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-0000000000a7', 'parent.a7@test.local', '{}'),
  ('bbbbbbbb-0000-0000-0000-0000000000b7', 'parent.b7@test.local', '{}'),
  ('dddddddd-0000-0000-0000-0000000000d7', 'teen7@test.local',     '{}'),
  ('dddddddd-0000-0000-0000-0000000000d8', 'teen8@test.local',     '{}');

-- Teen: born 15 years ago (definitely 13-17). Young: born 9 years ago.
-- Borderline: born 13 years ago (might still be 12). NoConsent: a teen without consent.
insert into public.players (id, first_name, birth_year) values
  ('77777777-0000-0000-0000-000000000001', 'Teen',       extract(year from now())::int - 15),
  ('77777777-0000-0000-0000-000000000002', 'Young',      extract(year from now())::int - 9),
  ('77777777-0000-0000-0000-000000000003', 'Borderline', extract(year from now())::int - 13),
  ('77777777-0000-0000-0000-000000000004', 'NoConsent',  extract(year from now())::int - 15);
insert into public.guardianships (guardian_id, player_id)
  select 'aaaaaaaa-0000-0000-0000-0000000000a7', id from public.players where id::text like '77777777%';
insert into public.consents (player_id, guardian_id, consent_version)
  select id, 'aaaaaaaa-0000-0000-0000-0000000000a7', 'v1-draft' from public.players
  where id in ('77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000002',
               '77777777-0000-0000-0000-000000000003');

-- ===================== Checking an invite =====================
select tests.login('aaaaaaaa-0000-0000-0000-0000000000a7');
select is(public.check_teen_invite('77777777-0000-0000-0000-000000000001'), 'Teen',
  'parent can invite their 15-year-old');
select throws_ok($$select public.check_teen_invite('77777777-0000-0000-0000-000000000002')$$,
  '22023', null, 'an under-13 can never be invited');
select throws_ok($$select public.check_teen_invite('77777777-0000-0000-0000-000000000003')$$,
  '22023', null, 'a child who might still be 12 cannot be invited yet');
select throws_ok($$select public.check_teen_invite('77777777-0000-0000-0000-000000000004')$$,
  '22023', 'Please give consent first.', 'no invite without active consent');

select tests.login('bbbbbbbb-0000-0000-0000-0000000000b7');
select throws_ok($$select public.check_teen_invite('77777777-0000-0000-0000-000000000001')$$,
  '42501', null, 'another parent cannot invite someone else''s child');

-- ===================== Linking (server only) =====================
select tests.login('aaaaaaaa-0000-0000-0000-0000000000a7');
select throws_ok(
  $$select public.link_teen_login('77777777-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-0000000000d7', 'aaaaaaaa-0000-0000-0000-0000000000a7')$$,
  '42501', null, 'a parent cannot call the server-only linking step directly');
reset role;

-- Act as the server: the secret key carries no person's identity.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(
  $$select public.link_teen_login('77777777-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-0000000000d7', 'bbbbbbbb-0000-0000-0000-0000000000b7')$$,
  '42501', null, 'linking fails if the requester is not the guardian');
select throws_ok(
  $$select public.link_teen_login('77777777-0000-0000-0000-000000000002',
    'dddddddd-0000-0000-0000-0000000000d7', 'aaaaaaaa-0000-0000-0000-0000000000a7')$$,
  '22023', null, 'linking an under-13 fails even on the server');
select lives_ok(
  $$select public.link_teen_login('77777777-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-0000000000d7', 'aaaaaaaa-0000-0000-0000-0000000000a7')$$,
  'the server links the teen''s new login');
select throws_ok(
  $$select public.link_teen_login('77777777-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-0000000000d8', 'aaaaaaaa-0000-0000-0000-0000000000a7')$$,
  '22023', null, 'a child can only have one login');
reset role;

select is((select role::text from public.profiles where id = 'dddddddd-0000-0000-0000-0000000000d7'), 'player',
  'the teen''s login is a player login');

select tests.login('aaaaaaaa-0000-0000-0000-0000000000a7');
select throws_ok($$select public.check_teen_invite('77777777-0000-0000-0000-000000000001')$$,
  '22023', null, 'cannot invite a teen who already has a login');

-- ===================== The teen's own access follows consent =====================
select tests.login('dddddddd-0000-0000-0000-0000000000d7');
select results_eq('select first_name from public.players', array['Teen'],
  'the teen sees only their own record');

reset role;
update public.consents set withdrawn_at = now() where player_id = '77777777-0000-0000-0000-000000000001';
select tests.login('dddddddd-0000-0000-0000-0000000000d7');
select is((select count(*)::int from public.players), 0,
  'after the parent withdraws consent, the teen sees nothing');

-- The parent still sees and controls everything.
select tests.login('aaaaaaaa-0000-0000-0000-0000000000a7');
select is((select count(*)::int from public.players where id = '77777777-0000-0000-0000-000000000001'), 1,
  'the parent still sees the teen');
select is((select user_id from public.players where id = '77777777-0000-0000-0000-000000000001'),
  'dddddddd-0000-0000-0000-0000000000d7'::uuid, 'the parent can see the teen has a login (to remove it)');

select * from finish();
rollback;
