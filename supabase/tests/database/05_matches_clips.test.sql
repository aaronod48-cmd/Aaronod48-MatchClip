-- Week 2 Step 1 checks: matches, videos, clips, tags, default coach,
-- logging staff views, and queueing files for real deletion.
begin;
create extension if not exists pgtap with schema extensions;
-- Start with no default coach (everything here is undone at the end).
update public.app_settings set default_coach_id = null;
select plan(59);

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
create function tests.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
grant usage on schema tests to authenticated, service_role;
grant execute on all functions in schema tests to authenticated, service_role;

-- People
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'p@test.local',   '{"display_name":"Pat Parent"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'q@test.local',   '{}'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@test.local',   '{"display_name":"Coach"}'),
  ('d0000000-0000-0000-0000-00000000000d', 't@test.local',   '{"account_type":"player","display_name":"Tess"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'a@test.local',   '{"account_type":"player","display_name":"Adam"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'x@test.local',   '{}');
update public.profiles set role = 'coach' where id = 'c0000000-0000-0000-0000-00000000000c';
update public.profiles set role = 'admin' where id = 'f0000000-0000-0000-0000-00000000000f';

-- Children of Parent P: Kid (consent), Kid2 (no consent), Tess (teen with own login, consent)
insert into public.players (id, first_name, birth_year, user_id) values
  ('11000000-0000-0000-0000-000000000001', 'Kid',  extract(year from now())::int - 10, null),
  ('11000000-0000-0000-0000-000000000002', 'Kid2', extract(year from now())::int - 10, null),
  ('11000000-0000-0000-0000-000000000003', 'Tess', extract(year from now())::int - 15, 'd0000000-0000-0000-0000-00000000000d');
insert into public.guardianships (guardian_id, player_id)
  select 'a0000000-0000-0000-0000-00000000000a', id from public.players where id::text like '11000000%';
insert into public.consents (player_id, guardian_id, consent_version) values
  ('11000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'v1-draft'),
  ('11000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'v1-draft');

create table tests.ids (name text primary key, id uuid);
grant select, insert, update on tests.ids to authenticated, service_role;

-- ===================== Default coach =====================
select tests.login('a0000000-0000-0000-0000-00000000000a');
update public.app_settings set default_coach_id = 'a0000000-0000-0000-0000-00000000000a';
reset role;
select is((select default_coach_id from public.app_settings), null, 'a parent cannot change the default coach');

select tests.login('f0000000-0000-0000-0000-00000000000f');
select throws_ok($$update public.app_settings set default_coach_id = 'a0000000-0000-0000-0000-00000000000a'$$,
  '22023', null, 'the default coach must be a coach or admin');
select lives_ok($$update public.app_settings set default_coach_id = 'c0000000-0000-0000-0000-00000000000c'$$,
  'admin sets the default coach');
reset role;
select is((select count(*)::int from public.coach_assignments
           where coach_id = 'c0000000-0000-0000-0000-00000000000c' and ended_at is null
             and player_id::text like '11000000%'), 3,
  'existing players without a coach are given to the default coach');

-- ===================== Adult player profile =====================
select tests.login('e0000000-0000-0000-0000-00000000000e');
select throws_ok($$select public.create_my_player_profile(extract(year from now())::int - 16, null)$$,
  '22023', null, 'a player under 18 cannot create their own profile');
select lives_ok($$insert into tests.ids values ('adam', public.create_my_player_profile(extract(year from now())::int - 25, 'Sunday League'))$$,
  'an adult player creates their own profile');
select throws_ok($$select public.create_my_player_profile(extract(year from now())::int - 25, null)$$,
  '22023', null, 'only one profile per adult player');
select tests.login('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.create_my_player_profile(1990, null)$$,
  '42501', null, 'a parent account cannot create a player profile for itself');
reset role;
select is((select first_name from public.players where id = (select id from tests.ids where name = 'adam')), 'Adam',
  'the adult''s name comes from their account');
select ok(exists (select 1 from public.coach_assignments where player_id = (select id from tests.ids where name = 'adam')
                  and coach_id = 'c0000000-0000-0000-0000-00000000000c'),
  'a new player is automatically given to the default coach');

-- ===================== Creating matches =====================
select tests.login('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into tests.ids values ('m_kid', public.create_match('11000000-0000-0000-0000-000000000001',
  current_date, 'Rovers', '4-3-3', 'Red shirts, white shorts', 7, 'RW'))$$, 'parent creates a match for their child');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000002', current_date, null, '4-4-2', 'Blue', 4, 'RCB')$$,
  '42501', null, 'no match for a child without consent');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date, null, '4-4-2', 'Blue', 9, 'ST')$$,
  '22023', 'Please choose your position.', 'position must belong to the chosen shape (ST is 4-3-3 only)');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date + 10, null, '4-4-2', 'Blue', 9, 'RST')$$,
  '22023', null, 'match date cannot be in the future');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date, null, '4-4-2', 'Blue', 0, 'RST')$$,
  '22023', null, 'shirt number must be 1-99');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date, null, '4-4-2', '  ', 9, 'RST')$$,
  '22023', null, 'kit colour is needed');

select tests.login('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date, null, '4-4-2', 'Blue', 4, 'RCB')$$,
  '42501', null, 'another parent cannot add a match for someone else''s child');
select tests.login('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.create_match('11000000-0000-0000-0000-000000000001', current_date, null, '4-4-2', 'Blue', 4, 'RCB')$$,
  '42501', null, 'a coach cannot add a match');
select tests.login('d0000000-0000-0000-0000-00000000000d');
select lives_ok($$insert into tests.ids values ('m_tess', public.create_match('11000000-0000-0000-0000-000000000003',
  current_date - 2, null, '4-4-2', 'Green and gold hoops', 10, 'LCM'))$$, 'a teen creates a match for themselves');
select tests.login('e0000000-0000-0000-0000-00000000000e');
select lives_ok($$insert into tests.ids values ('m_adam', public.create_match((select id from tests.ids where name = 'adam'),
  current_date - 1, 'City', '4-4-2', 'Black', 9, 'RST'))$$, 'an adult player creates a match for themselves');
reset role;
select results_eq($$select half from public.match_videos where match_id = (select id from tests.ids where name = 'm_kid') order by half$$,
  array['first', 'second'], 'each match gets a first-half and a second-half video slot');

-- ===================== Tap yourself and send to coach =====================
select tests.login('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.submit_match((select id from tests.ids where name = 'm_kid'))$$,
  '22023', 'Please tap yourself first.', 'cannot send to the coach before tapping yourself');
select throws_ok($$select public.set_match_tap((select id from tests.ids where name = 'm_kid'), 'first', 12, 1.5, 0.5)$$,
  '22023', null, 'a tap outside the picture is refused');
select lives_ok($$select public.set_match_tap((select id from tests.ids where name = 'm_kid'), 'first', 12.5, 0.42, 0.61)$$,
  'parent taps their child on a frame');
select throws_ok($$select public.submit_match((select id from tests.ids where name = 'm_kid'))$$,
  '22023', 'Please upload at least one half first.', 'cannot send to the coach before a half is uploaded');
reset role;
update public.match_videos set status = 'processing', provider_upload_id = 'up_1', provider_asset_id = 'asset_first'
  where match_id = (select id from tests.ids where name = 'm_kid') and half = 'first';
select tests.login('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.submit_match((select id from tests.ids where name = 'm_kid'))$$, 'match sent to the coach');
select is((select status from public.matches where id = (select id from tests.ids where name = 'm_kid')), 'waiting_for_coach',
  'status is now waiting for coach');
select throws_ok($$update public.matches set status = 'published' where id = (select id from tests.ids where name = 'm_kid')$$,
  '42501', null, 'a parent cannot publish by editing the status');

-- ===================== Who sees matches =====================
select is((select count(*)::int from public.matches), 2,
  'parent sees their children''s matches, including one their teen uploaded themselves');
select tests.login('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.matches) + (select count(*)::int from public.match_videos), 0,
  'another parent sees no matches or videos');
select tests.login('f0000000-0000-0000-0000-00000000000f');
select is((select count(*)::int from public.matches) + (select count(*)::int from public.match_videos), 0,
  'an admin who isn''t the coach sees no matches or videos');
select tests.login('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.matches where id in (select id from tests.ids)), 3,
  'the assigned coach sees all three matches');

-- ===================== Coach makes clips =====================
select lives_ok($$select public.start_review((select id from tests.ids where name = 'm_kid'))$$, 'coach starts the review');
select lives_ok($$insert into public.clips (match_id, start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note)
  values ((select id from tests.ids where name = 'm_kid'), 120, 130, 2, 0.4, 0.6, 'Great first touch under pressure', 'Scan before receiving')$$,
  'coach creates a clip with a ring and notes');
select throws_ok($$insert into public.clips (match_id, start_seconds, end_seconds) values ((select id from tests.ids where name = 'm_kid'), 0, 90)$$,
  '23514', null, 'a clip longer than 60 seconds is refused');
select throws_ok($$insert into public.clips (match_id, start_seconds, end_seconds, status) values ((select id from tests.ids where name = 'm_kid'), 0, 10, 'published')$$,
  '42501', null, 'a clip cannot be created already published');
insert into tests.ids select 'clip1', id from public.clips where strength_note = 'Great first touch under pressure';
select lives_ok($$insert into public.clip_tags (clip_id, tag_id, confirmed_by, confirmed_at)
  values ((select id from tests.ids where name = 'clip1'), (select id from public.tags where name = 'First touch'),
          'c0000000-0000-0000-0000-00000000000c', now())$$, 'coach tags the clip');
select throws_ok($$insert into public.clip_tags (clip_id, tag_id, source) values
  ((select id from tests.ids where name = 'clip1'), (select id from public.tags where name = 'Duels'), 'ai')$$,
  '42501', null, 'a coach cannot pretend a tag came from AI');
reset role;
-- The server adds an AI-suggested tag (not confirmed by a coach).
select tests.as_server();
insert into public.clip_tags (clip_id, tag_id, source)
  values ((select id from tests.ids where name = 'clip1'), (select id from public.tags where name = 'Passing'), 'ai');
reset role;

select tests.login('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.clips) + (select count(*)::int from public.clip_tags), 0,
  'before publishing, the parent sees no clips or tags');
select throws_ok($$insert into public.clips (match_id, start_seconds, end_seconds) values ((select id from tests.ids where name = 'm_kid'), 0, 10)$$,
  '42501', null, 'a parent cannot create clips');
select throws_ok($$select public.publish_match((select id from tests.ids where name = 'm_kid'))$$,
  '42501', null, 'a parent cannot publish');
select throws_ok($$select public.set_match_tap((select id from tests.ids where name = 'm_kid'), 'first', 3, 0.5, 0.5)$$,
  '22023', null, 'the tap cannot be changed once the coach is reviewing');

-- ===================== Publish =====================
reset role;
select tests.make_report((select id from tests.ids where name = 'm_kid'));
select tests.login('c0000000-0000-0000-0000-00000000000c');
select is(public.publish_match((select id from tests.ids where name = 'm_kid')), 1, 'coach publishes: 1 clip goes live');
select ok((select bool_and(delete_after between now() + interval '59 days' and now() + interval '61 days')
           from public.match_videos where match_id = (select id from tests.ids where name = 'm_kid')),
  'the full match video is set to be deleted in 60 days');
-- A new clip made after publishing starts as a draft.
insert into public.clips (match_id, start_seconds, end_seconds, strength_note)
  values ((select id from tests.ids where name = 'm_kid'), 300, 310, 'Draft after publish');
insert into tests.ids select 'clip_draft', id from public.clips where strength_note = 'Draft after publish';

select tests.login('a0000000-0000-0000-0000-00000000000a');
select results_eq('select strength_note from public.clips', array['Great first touch under pressure'],
  'parent now sees the published clip, but not the new draft');
select results_eq('select t.name from public.clip_tags ct join public.tags t on t.id = ct.tag_id', array['First touch'],
  'parent sees only the coach-confirmed tag, not the AI suggestion');

-- ===================== Viewing media and the staff access log =====================
select lives_ok($$select public.record_media_view((select id from tests.ids where name = 'm_kid'), 'view_clip', (select id from tests.ids where name = 'clip1'))$$,
  'parent can open the published clip');
select throws_ok($$select public.record_media_view((select id from tests.ids where name = 'm_kid'), 'view_clip', (select id from tests.ids where name = 'clip_draft'))$$,
  '42501', null, 'parent cannot open a draft clip');
select tests.login('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.record_media_view((select id from tests.ids where name = 'm_kid'), 'view_video', null)$$,
  '42501', null, 'another parent cannot open the video');
reset role;
create table tests.log_before as select count(*)::int as n from public.staff_access_log;
grant select on tests.log_before to authenticated;
select tests.login('c0000000-0000-0000-0000-00000000000c');
select public.record_media_view((select id from tests.ids where name = 'm_kid'), 'view_video', null);
select public.record_media_view((select id from tests.ids where name = 'm_adam'), 'view_video', null);
reset role;
select is((select count(*)::int from public.staff_access_log) - (select n from tests.log_before), 1,
  'the coach opening a minor''s video is logged (an adult''s is not)');
select tests.login('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.staff_access_log where action = 'view_video'), 1,
  'the parent can see that the coach opened their child''s video');

-- ===================== Consent withdrawn =====================
select public.withdraw_consent('11000000-0000-0000-0000-000000000001');
select tests.login('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.matches where player_id = '11000000-0000-0000-0000-000000000001'), 0,
  'after consent is withdrawn, the coach can no longer see the child''s match');
select throws_ok($$select public.record_media_view((select id from tests.ids where name = 'm_kid'), 'view_video', null)$$,
  '42501', null, 'and cannot open the video');

-- ===================== Deleting really deletes =====================
select tests.login('d0000000-0000-0000-0000-00000000000d');
delete from public.matches where id = (select id from tests.ids where name = 'm_tess');
reset role;
select is((select count(*)::int from public.matches where id = (select id from tests.ids where name = 'm_tess')), 1,
  'a teen cannot delete their own match (their parent can)');

reset role;
update public.clips set provider_asset_id = 'asset_clip1' where id = (select id from tests.ids where name = 'clip1');
select tests.login('a0000000-0000-0000-0000-00000000000a');
delete from public.matches where id = (select id from tests.ids where name = 'm_kid');
reset role;
select is((select count(*)::int from public.matches where id = (select id from tests.ids where name = 'm_kid')), 0,
  'parent deletes the match');
select results_eq($$select kind, coalesce(asset_id, upload_id) from private.provider_deletions
  where coalesce(asset_id, upload_id) in ('asset_clip1', 'asset_first') order by kind$$,
  $$values ('clip'::text, 'asset_clip1'::text), ('match_video'::text, 'asset_first'::text)$$,
  'the video and clip files are queued for deletion at the video service');

-- ===================== Nobody else can touch the deletion queue =====================
select tests.login('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$select count(*) from private.provider_deletions$$, '42501', null,
  'logged-in users cannot see the deletion queue');
reset role;
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'anon' and table_name in ('matches','match_videos','clips','clip_tags','app_settings')), 0,
  'visitors who are not logged in have no access to the new tables');

-- ===================== Matches the app =====================
select ok(private.valid_position('4-3-3', 'ST') and not private.valid_position('4-4-2', 'ST'),
  'positions match src/config/formations.ts');

select * from finish();
rollback;
