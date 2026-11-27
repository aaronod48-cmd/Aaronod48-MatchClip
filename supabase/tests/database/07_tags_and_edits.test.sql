-- Checks for the tag admin screen and editing after publishing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create schema tests;
create function tests.make_report(p_match uuid) returns void language plpgsql as $f$
declare r uuid;
begin
  insert into public.reports (match_id) values (p_match) returning id into r;
  insert into public.report_scores (report_id, slot, category_name, score)
    values (r, 1, 'Passing', 7), (r, 2, 'Duels', 6), (r, 3, 'Positioning', 7), (r, 4, 'Decision making', 6);
  insert into public.report_items (report_id, kind, body) values (r, 'strength', 'Test strength');
end $f$;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-00000000000a', 'p7@test.local'),
  ('c7000000-0000-0000-0000-00000000000c', 'c7@test.local'),
  ('f7000000-0000-0000-0000-00000000000f', 'x7@test.local');
update public.profiles set role = 'coach' where id = 'c7000000-0000-0000-0000-00000000000c';
update public.profiles set role = 'admin' where id = 'f7000000-0000-0000-0000-00000000000f';

-- ===================== Tags: only an admin manages them =====================
select tests.login('a7000000-0000-0000-0000-00000000000a');
select throws_ok($$insert into public.tags (name, sort_order) values ('Sneaky', 99)$$, '42501', null,
  'a parent cannot add a tag');
update public.tags set name = 'Hacked' where name = 'Passing';
reset role;
select is((select count(*)::int from public.tags where name = 'Passing'), 1, 'a parent cannot rename a tag');

select tests.login('c7000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into public.tags (name, sort_order) values ('Coachy', 99)$$, '42501', null,
  'a coach cannot add a tag (only admin)');

select tests.login('f7000000-0000-0000-0000-00000000000f');
select lives_ok($$insert into public.tags (name, sort_order) values ('Heading', 11)$$, 'admin adds a tag');
select lives_ok($$update public.tags set name = 'Long passing' where name = 'Passing'$$, 'admin renames a tag');
select lives_ok($$update public.tags set is_active = false where name = 'Heading'$$, 'admin hides a tag');
select throws_ok($$insert into public.tags (name) values ('Shooting')$$, '23505', null, 'tag names must be unique');
select throws_ok($$insert into public.tags (name) values ('   ')$$, '23514', null, 'a blank tag name is refused');

-- ===================== Editing after publishing =====================
reset role;
insert into public.players (id, first_name, birth_year) values ('77700000-0000-0000-0000-000000000001', 'Kid', extract(year from now())::int - 10);
insert into public.guardianships values ('a7000000-0000-0000-0000-00000000000a', '77700000-0000-0000-0000-000000000001');
insert into public.consents (player_id, guardian_id, consent_version)
  values ('77700000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-00000000000a', 'v1-draft');
insert into public.coach_assignments (coach_id, player_id) values ('c7000000-0000-0000-0000-00000000000c', '77700000-0000-0000-0000-000000000001');
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position, status)
  values ('7a700000-0000-0000-0000-000000000001', '77700000-0000-0000-0000-000000000001', current_date, '4-4-2', 'Red', 7, 'RM', 'in_review');
insert into public.clips (id, match_id, start_seconds, end_seconds, strength_note)
  values ('7c700000-0000-0000-0000-000000000001', '7a700000-0000-0000-0000-000000000001', 10, 20, 'First');

reset role;
select tests.make_report('7a700000-0000-0000-0000-000000000001');
select tests.login('c7000000-0000-0000-0000-00000000000c');
select is(public.publish_match('7a700000-0000-0000-0000-000000000001'), 1, 'coach publishes the first clip');
select throws_ok($$update public.clips set start_seconds = 12 where id = '7c700000-0000-0000-0000-000000000001'$$,
  '22023', null, 'a published clip''s times are locked');
select lives_ok($$update public.clips set strength_note = 'First, updated', ring_x = 0.5, ring_y = 0.5, ring_seconds = 1
  where id = '7c700000-0000-0000-0000-000000000001'$$, 'notes and the ring can still change after publishing');
insert into public.clips (match_id, start_seconds, end_seconds, strength_note)
  values ('7a700000-0000-0000-0000-000000000001', 30, 40, 'Added later');
select is(public.publish_match('7a700000-0000-0000-0000-000000000001'), 1, 'a clip added later is published by publishing again');

select tests.login('a7000000-0000-0000-0000-00000000000a');
select results_eq('select strength_note from public.clips order by start_seconds', array['First, updated', 'Added later'],
  'the parent sees the updated note and the newly published clip');

reset role;
select throws_ok($$select public.publish_match('7a700000-0000-0000-0000-000000000001')$$, '42501', null,
  'publishing needs the coach (not the system with no one logged in)');

select * from finish();
rollback;
