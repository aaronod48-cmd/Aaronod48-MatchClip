-- Week 2 Step 2 checks: who can start an upload, and re-trying a failed half.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;
grant usage on schema tests to service_role;

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-00000000000a', 'p6@test.local'),
  ('b6000000-0000-0000-0000-00000000000b', 'q6@test.local');
insert into public.players (id, first_name, birth_year)
  values ('66000000-0000-0000-0000-000000000001', 'Kid', extract(year from now())::int - 10);
insert into public.guardianships values ('a6000000-0000-0000-0000-00000000000a', '66000000-0000-0000-0000-000000000001');
insert into public.consents (player_id, guardian_id, consent_version)
  values ('66000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-00000000000a', 'v1-draft');
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position)
  values ('6a000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000001', current_date, '4-4-2', 'Red', 7, 'RM');
insert into public.match_videos (match_id, half) values
  ('6a000000-0000-0000-0000-000000000001', 'first'), ('6a000000-0000-0000-0000-000000000001', 'second');

select tests.login('a6000000-0000-0000-0000-00000000000a');
select isnt(public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'first'), null,
  'parent can start uploading a half');
select throws_ok($$select public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'third')$$,
  '22023', null, 'only first and second halves exist');

select tests.login('b6000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'first')$$,
  '42501', null, 'another parent cannot upload to this match');

-- A failed first attempt, then a retry.
reset role;
update public.match_videos set status = 'errored', provider_upload_id = 'up_old', provider_asset_id = 'asset_old'
  where match_id = '6a000000-0000-0000-0000-000000000001' and half = 'first';
select tests.login('a6000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'first')$$,
  'a failed half can be uploaded again');
reset role;
select is((select provider_asset_id from public.match_videos
           where match_id = '6a000000-0000-0000-0000-000000000001' and half = 'first'), null,
  'the failed attempt is cleared from the match');
select is((select count(*)::int from private.provider_deletions where asset_id = 'asset_old'), 1,
  'and its file is queued for deletion');

update public.match_videos set status = 'processing'
  where match_id = '6a000000-0000-0000-0000-000000000001' and half = 'first';
select tests.login('a6000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'first')$$,
  '22023', 'This half is already uploaded.', 'an uploaded half cannot be overwritten');

reset role;
update public.matches set status = 'waiting_for_coach' where id = '6a000000-0000-0000-0000-000000000001';
select tests.login('a6000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.prepare_video_upload('6a000000-0000-0000-0000-000000000001', 'second')$$,
  '22023', null, 'no uploads once the match is with the coach');

-- The server records an upload the same way the app does (secret key).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok($$update public.match_videos set provider = 'mux', provider_upload_id = 'up_new', status = 'ready',
  provider_asset_id = 'a_new', provider_playback_id = 'p_new', duration_seconds = 2700
  where match_id = '6a000000-0000-0000-0000-000000000001' and half = 'second'$$,
  'the server can record an uploaded half (including the 60-minute check)');
reset role;

select * from finish();
rollback;
