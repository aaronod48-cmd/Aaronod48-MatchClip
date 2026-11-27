-- Week 3 Step 1 checks: score categories, drills, reports, focus and sharing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function tests.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
grant usage on schema tests to authenticated, service_role;
grant execute on all functions in schema tests to authenticated, service_role;
create table tests.vals (k text primary key, v text);
grant select, insert, update on tests.vals to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-0000-0000-00000000000a', 'p9@test.local', '{}'),
  ('b9000000-0000-0000-0000-00000000000b', 'q9@test.local', '{}'),
  ('c9000000-0000-0000-0000-00000000000c', 'c9@test.local', '{}'),
  ('c9000000-0000-0000-0000-00000000000d', 'd9@test.local', '{}'),
  ('f9000000-0000-0000-0000-00000000000f', 'x9@test.local', '{}');
update public.profiles set role = 'coach' where id in ('c9000000-0000-0000-0000-00000000000c', 'c9000000-0000-0000-0000-00000000000d');
update public.profiles set role = 'admin' where id = 'f9000000-0000-0000-0000-00000000000f';

insert into public.players (id, first_name, birth_year) values ('99000000-0000-0000-0000-000000000001', 'Kid', extract(year from now())::int - 10);
insert into public.guardianships values ('a9000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001');
insert into public.consents (player_id, guardian_id, consent_version)
  values ('99000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'v1-draft');
insert into public.coach_assignments (coach_id, player_id) values ('c9000000-0000-0000-0000-00000000000c', '99000000-0000-0000-0000-000000000001');
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position, status)
  values ('9a000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000001', current_date, '4-4-2', 'Red', 7, 'RM', 'in_review');
insert into public.clips (id, match_id, start_seconds, end_seconds, strength_note)
  values ('9c000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 10, 20, 'Clip strength');

-- ===================== Score categories =====================
select tests.login('a9000000-0000-0000-0000-00000000000a');
select results_eq($$select name from public.score_categories where name in ('Passing','Duels','Positioning','Decision making') order by sort_order$$,
  array['Passing','Duels','Positioning','Decision making'], 'the four starter score categories exist, in order');
select throws_ok($$insert into public.score_categories (name) values ('Sneaky')$$, '42501', null, 'a parent cannot add score categories');
select tests.login('f9000000-0000-0000-0000-00000000000f');
select lives_ok($$insert into public.score_categories (name, sort_order) values ('Work rate', 5)$$, 'admin adds a score category');

-- ===================== Drills =====================
select tests.login('a9000000-0000-0000-0000-00000000000a');
select throws_ok($$insert into public.drills (title) values ('Parent drill')$$, '42501', null, 'a parent cannot add drills');
select tests.login('c9000000-0000-0000-0000-00000000000c');
select lives_ok($$insert into public.drills (title, description) values ('Scan and receive', 'Check shoulder twice before the ball arrives')$$, 'coach adds a drill to the library');
insert into tests.vals select 'drill', id::text from public.drills where title = 'Scan and receive';
select tests.login('c9000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.drills where title = 'Scan and receive'), 1, 'other coaches can use the shared drill library');
update public.drills set title = 'Changed by someone else' where title = 'Scan and receive';
select tests.login('a9000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.drills), 0, 'parents cannot see the drill library');
reset role;
select is((select count(*)::int from public.drills where title = 'Scan and receive'), 1, 'a coach cannot edit another coach''s drill');

-- ===================== Writing a report =====================
select tests.login('c9000000-0000-0000-0000-00000000000d');
select throws_ok($$insert into public.reports (match_id) values ('9a000000-0000-0000-0000-000000000001')$$, '42501', null,
  'a coach not assigned to the player cannot start a report');
select tests.login('a9000000-0000-0000-0000-00000000000a');
select throws_ok($$insert into public.reports (match_id) values ('9a000000-0000-0000-0000-000000000001')$$, '42501', null,
  'a parent cannot start a report');
select tests.login('c9000000-0000-0000-0000-00000000000c');
select lives_ok($$insert into public.reports (match_id) values ('9a000000-0000-0000-0000-000000000001')$$,
  'the assigned coach starts the report');
reset role;
insert into tests.vals select 'report', id::text from public.reports where match_id = '9a000000-0000-0000-0000-000000000001'
  on conflict (k) do update set v = excluded.v;
select tests.login('c9000000-0000-0000-0000-00000000000c');
select throws_ok($$insert into public.report_scores (report_id, slot, category_name, score) values ((select v::uuid from tests.vals where k='report'), 1, 'Passing', 11)$$,
  '23514', null, 'scores must be 1 to 10');
select throws_ok($$insert into public.report_scores (report_id, slot, category_name, score) values ((select v::uuid from tests.vals where k='report'), 5, 'Passing', 7)$$,
  '23514', null, 'only four score slots');
insert into public.report_scores (report_id, slot, category_id, category_name, score)
  select (select v::uuid from tests.vals where k = 'report'), s.slot, c.id, c.name, s.score
  from (values (1, 'Passing', 7), (2, 'Duels', 6), (3, 'Positioning', 8)) as s(slot, name, score)
  join public.score_categories c on c.name = s.name;
insert into public.report_items (report_id, kind, body) values ((select v::uuid from tests.vals where k='report'), 'strength', 'Brave on the ball');
select throws_ok($$insert into public.report_items (report_id, kind, body, drill_title) values ((select v::uuid from tests.vals where k='report'), 'strength', 'x', 'drill')$$,
  '23514', null, 'a strength cannot have a drill');
insert into public.report_items (report_id, kind, body, sort_order) values ((select v::uuid from tests.vals where k='report'), 'workon', 'Scan earlier', 1);

select throws_ok($$select public.publish_match('9a000000-0000-0000-0000-000000000001')$$, '22023', 'Give all four scores before publishing.',
  'a report needs all four scores to publish');
insert into public.report_scores (report_id, slot, category_id, category_name, score)
  select (select v::uuid from tests.vals where k = 'report'), 4, id, name, 5 from public.score_categories where name = 'Decision making';
select throws_ok($$select public.publish_match('9a000000-0000-0000-0000-000000000001')$$, '22023', 'Every work-on needs a drill before publishing.',
  'every work-on needs a drill to publish');
update public.report_items set drill_id = (select v::uuid from tests.vals where k='drill'), drill_title = 'Scan and receive',
  drill_description = 'Check shoulder twice before the ball arrives' where kind = 'workon';

select tests.login('a9000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.reports) + (select count(*)::int from public.report_items), 0,
  'before publishing, the parent sees no report');
update public.report_items set body = 'parent edit';
reset role;
select is((select count(*)::int from public.report_items where body = 'parent edit'), 0, 'a parent cannot edit the report');
select tests.login('a9000000-0000-0000-0000-00000000000a');

select tests.login('c9000000-0000-0000-0000-00000000000c');
select is(public.publish_match('9a000000-0000-0000-0000-000000000001'), 1, 'coach publishes the clip and the report together');
select is((select status from public.reports where match_id = '9a000000-0000-0000-0000-000000000001'), 'published', 'the report is published');

select tests.login('a9000000-0000-0000-0000-00000000000a');
select results_eq('select category_name, score::int from public.report_scores order by slot',
  $$values ('Passing'::text, 7), ('Duels'::text, 6), ('Positioning'::text, 8), ('Decision making'::text, 5)$$,
  'the parent sees the four scores');
select results_eq($$select kind, body, drill_title from public.report_items order by kind desc, sort_order$$,
  $$values ('workon'::text, 'Scan earlier'::text, 'Scan and receive'::text), ('strength'::text, 'Brave on the ball'::text, null::text)$$,
  'the parent sees the strength and the work-on with its drill');

-- Editing the library later doesn't change the sent report.
select tests.login('c9000000-0000-0000-0000-00000000000c');
update public.drills set title = 'Renamed drill' where id = (select v::uuid from tests.vals where k='drill');
select is((select drill_title from public.report_items where kind = 'workon'), 'Scan and receive',
  'editing a drill in the library does not change a sent report');

-- ===================== Focus =====================
reset role;
insert into tests.vals select 'workon', id::text from public.report_items where kind = 'workon';
insert into tests.vals select 'strength', id::text from public.report_items where kind = 'strength';
select tests.login('c9000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.set_focus((select v::uuid from tests.vals where k='workon'))$$, '42501', null, 'a coach cannot set a player''s focus');
select tests.login('b9000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.set_focus((select v::uuid from tests.vals where k='workon'))$$, '42501', null, 'another parent cannot set the focus');
select tests.login('a9000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.set_focus((select v::uuid from tests.vals where k='strength'))$$, '22023', null, 'only a work-on can be a focus');
select lives_ok($$select public.set_focus((select v::uuid from tests.vals where k='workon'))$$, 'the parent sets this week''s focus');
select lives_ok($$select public.set_focus((select v::uuid from tests.vals where k='workon'))$$, 'setting it again just replaces it');
select is((select count(*)::int from public.player_focus), 1, 'one focus per player per week');
select tests.login('c9000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.player_focus), 1, 'the coach can see the player''s focus');

-- ===================== Sharing =====================
select tests.login('b9000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.create_share_link('9a000000-0000-0000-0000-000000000001', null, 7, null)$$, '42501', null,
  'another parent cannot share this report');
select tests.login('c9000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.create_share_link('9a000000-0000-0000-0000-000000000001', null, 7, null)$$, '42501', null,
  'the coach cannot create share links (the player or parent does)');
select tests.login('a9000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.create_share_link('9a000000-0000-0000-0000-000000000001', null, 30, null)$$, '22023', null,
  'links last 1, 7 or 14 days only');
select lives_ok($$insert into tests.vals values ('token', public.create_share_link('9a000000-0000-0000-0000-000000000001', null, 7, 'Coach Sam at Rovers'))$$,
  'the parent shares the report');
select is((select count(*)::int from public.share_links where token_hash = (select v from tests.vals where k='token')), 0,
  'the secret in the link is never stored (only a scrambled version)');
select throws_ok($$select * from public.open_share_link((select v from tests.vals where k='token'))$$, '42501', null,
  'only the server can open a link (not a logged-in user directly)');

select tests.as_server();
select is((select kind from public.open_share_link((select v from tests.vals where k='token'))), 'report', 'a valid link opens the report');
select is((select count(*)::int from public.open_share_link('not-a-real-token')), 0, 'a made-up link opens nothing');
reset role;
select tests.login('a9000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.share_link_views), 1, 'the parent can see the link was opened once');
select tests.login('c9000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.share_links), 0, 'the coach cannot see the family''s share links');

-- Expired, consent withdrawn, stopped
reset role;
update public.share_links set expires_at = now() - interval '1 minute';
select tests.as_server();
select is((select count(*)::int from public.open_share_link((select v from tests.vals where k='token'))), 0, 'an expired link opens nothing');
reset role;
update public.share_links set expires_at = now() + interval '1 day';
update public.consents set withdrawn_at = now() where player_id = '99000000-0000-0000-0000-000000000001';
select tests.as_server();
select is((select count(*)::int from public.open_share_link((select v from tests.vals where k='token'))), 0,
  'when the parent withdraws consent, shared links stop working');
reset role;
update public.consents set withdrawn_at = null where player_id = '99000000-0000-0000-0000-000000000001';
select tests.login('a9000000-0000-0000-0000-00000000000a');
select public.revoke_share_link((select id from public.share_links limit 1));
select tests.as_server();
select is((select count(*)::int from public.open_share_link((select v from tests.vals where k='token'))), 0, 'a stopped link opens nothing');
reset role;

select * from finish();
rollback;
