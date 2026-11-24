-- Step 7b checks: adding a child always comes with consent, and only the
-- right person can add a child, withdraw consent or give it again.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'parent.a@test.local', '{}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'parent.b@test.local', '{}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'adult@test.local', '{"account_type":"player"}'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'coach@test.local', '{}');
update public.profiles set role = 'coach' where id = 'eeeeeeee-0000-0000-0000-00000000000e';

-- A child born 9 years ago (definitely under 13)
create table tests.vals as select extract(year from now())::int - 9 as child_year,
                                  extract(year from now())::int - 19 as adult_year,
                                  extract(year from now())::int - 18 as maybe17_year;
grant select on tests.vals to authenticated;

-- ===================== Parent A adds a child =====================
select tests.login('aaaaaaaa-0000-0000-0000-00000000000a');

select lives_ok(
  $$select public.add_child('  Sam ', (select child_year from tests.vals), 'Under 10 Lions', 'v1-draft', true)$$,
  'Parent A can add a child with consent');
select results_eq('select first_name, team_name from public.players',
  $$values ('Sam'::text, 'Under 10 Lions'::text)$$,
  'the child is saved (name tidied), and Parent A can see them');
select is((select count(*)::int from public.guardianships), 1, 'Parent A is linked as the guardian');
select is((select consent_version from public.consents), 'v1-draft', 'the consent is saved with the wording version');
select ok((select withdrawn_at is null from public.consents), 'the consent is active');

select throws_ok(
  $$select public.add_child('NoConsent', (select child_year from tests.vals), null, 'v1-draft', false)$$,
  '22023', 'Consent is needed to add a child.', 'no tick, no child');
select throws_ok(
  $$select public.add_child('OldWording', (select child_year from tests.vals), null, 'v0-old', true)$$,
  '22023', null, 'consent to old wording is refused');
select throws_ok(
  $$select public.add_child('Grown', (select adult_year from tests.vals), null, 'v1-draft', true)$$,
  '22023', null, 'an adult cannot be added as a child');
select lives_ok(
  $$select public.add_child('MaybeSeventeen', (select maybe17_year from tests.vals), null, 'v1-draft', true)$$,
  'a player who might still be 17 can be added');
select throws_ok(
  $$select public.add_child('', (select child_year from tests.vals), null, 'v1-draft', true)$$,
  '22023', null, 'a blank name is refused');
select is((select count(*)::int from public.players), 2, 'refused attempts saved nothing');

-- ===================== Other people can't add children =====================
select tests.login('cccccccc-0000-0000-0000-00000000000c');
select throws_ok(
  $$select public.add_child('X', (select child_year from tests.vals), null, 'v1-draft', true)$$,
  '42501', null, 'an adult player account cannot add a child');
select tests.login('eeeeeeee-0000-0000-0000-00000000000e');
select throws_ok(
  $$select public.add_child('X', (select child_year from tests.vals), null, 'v1-draft', true)$$,
  '42501', null, 'a coach cannot add a child');
reset role;
set local role anon;
select throws_ok(
  $$select public.add_child('X', 2016, null, 'v1-draft', true)$$,
  '42501', null, 'someone not logged in cannot even call it');
reset role;

-- ===================== Withdraw and give consent again =====================
create table tests.sam as select id from public.players
  where first_name = 'Sam' and created_by = 'aaaaaaaa-0000-0000-0000-00000000000a';
grant select on tests.sam to authenticated;

select tests.login('bbbbbbbb-0000-0000-0000-00000000000b');
select throws_ok($$select public.withdraw_consent((select id from tests.sam))$$,
  '42501', null, 'Parent B cannot withdraw consent for Parent A''s child');
select throws_ok($$select public.give_consent((select id from tests.sam), 'v1-draft', true)$$,
  '42501', null, 'Parent B cannot give consent for Parent A''s child');

select tests.login('aaaaaaaa-0000-0000-0000-00000000000a');
select lives_ok($$select public.withdraw_consent((select id from tests.sam))$$,
  'Parent A can withdraw consent');
select is((select count(*)::int from public.consents c join tests.sam s on s.id = c.player_id
           where c.withdrawn_at is null), 0, 'Sam now has no active consent');
select throws_ok($$select public.give_consent((select id from tests.sam), 'v1-draft', false)$$,
  '22023', null, 'giving consent again needs the tick');
select lives_ok($$select public.give_consent((select id from tests.sam), 'v1-draft', true)$$,
  'Parent A can give consent again');
select is((select count(*)::int from public.consents c join tests.sam s on s.id = c.player_id), 2,
  'both the withdrawn and the new consent are kept on record');

-- ===================== Matches the app =====================
select is(private.current_consent_version(), 'v1-draft', 'consent version matches src/config/consent.ts');

select * from finish();
rollback;
