-- Step 3 checks: the tables exist, they're locked by default,
-- sign-up can't create staff, and deleting a parent cleans up.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- 1. All the tables exist
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array['profiles','players','guardianships','consents','organisations',
                  'organisation_members','coach_assignments','staff_access_log','tags']) as t;

-- 2. Every table in the public schema has row-level security switched on
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has row-level security ON'
);

-- 3. Starter data
select results_eq(
  'select name from public.tags order by sort_order',
  array['Beaten 1v1','Passing','Duels','First touch','Positioning','Defending','Transition'],
  'the seven starter tags are there, in order'
);
select is((select kind::text from public.organisations limit 1), 'independent',
  'one independent organisation exists for the owner');

-- 4. Signing up creates a profile, and can only create parent or player
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'parent@test.local', '{"display_name":"Pat"}'),
  ('00000000-0000-0000-0000-000000000002', 'adult@test.local',  '{"account_type":"player"}'),
  ('00000000-0000-0000-0000-000000000003', 'sneaky@test.local', '{"account_type":"coach"}'),
  ('00000000-0000-0000-0000-000000000004', 'sneaky2@test.local','{"account_type":"admin"}');

select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'parent', 'normal sign-up becomes a parent');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'player', 'adult player sign-up becomes a player');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  'parent', 'asking to sign up as a coach does NOT make you a coach');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000004'),
  'parent', 'asking to sign up as an admin does NOT make you an admin');

-- 5. Deleting a parent deletes their child (who has no login) and the consent record
insert into public.players (id, first_name, birth_year, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Sam', 2016, '00000000-0000-0000-0000-000000000001');
insert into public.guardianships (guardian_id, player_id)
values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
insert into public.consents (player_id, guardian_id, consent_version)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'v1-draft');

delete from auth.users where id = '00000000-0000-0000-0000-000000000001';

select is((select count(*)::int from public.players where id = '10000000-0000-0000-0000-000000000001'),
  0, 'deleting the parent deletes their child''s player record');
select is((select count(*)::int from public.consents where player_id = '10000000-0000-0000-0000-000000000001'),
  0, 'and the consent records with it');

select * from finish();
rollback;
