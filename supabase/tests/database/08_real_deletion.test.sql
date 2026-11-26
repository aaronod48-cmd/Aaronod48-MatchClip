-- Step 6 checks: deleting accounts and the 60-day clean-up really remove data,
-- and every video/clip file ends up on the deletion list.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-0000-0000-00000000000a', 'p8@test.local', '{}'),            -- parent
  ('b8000000-0000-0000-0000-00000000000b', 'q8@test.local', '{}'),            -- second parent (shares Shared)
  ('d8000000-0000-0000-0000-00000000000d', 't8@test.local', '{"account_type":"player"}'), -- teen login
  ('e8000000-0000-0000-0000-00000000000e', 'adult8@test.local', '{"account_type":"player"}'),
  ('f8000000-0000-0000-0000-00000000000f', 'admin8@test.local', '{}');
update public.profiles set role = 'admin' where id = 'f8000000-0000-0000-0000-00000000000f';
-- Make this the only admin for this test (everything is undone at the end).
update public.profiles set role = 'parent' where role = 'admin' and id <> 'f8000000-0000-0000-0000-00000000000f';

insert into public.players (id, first_name, birth_year, user_id) values
  ('88000000-0000-0000-0000-000000000001', 'Solo',   extract(year from now())::int - 10, null),
  ('88000000-0000-0000-0000-000000000002', 'Shared', extract(year from now())::int - 10, null),
  ('88000000-0000-0000-0000-000000000003', 'Teen',   extract(year from now())::int - 15, 'd8000000-0000-0000-0000-00000000000d'),
  ('88000000-0000-0000-0000-000000000004', 'Adult',  extract(year from now())::int - 30, 'e8000000-0000-0000-0000-00000000000e');
insert into public.guardianships (guardian_id, player_id) values
  ('a8000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-000000000002'),
  ('b8000000-0000-0000-0000-00000000000b', '88000000-0000-0000-0000-000000000002'),
  ('a8000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-000000000003');
insert into public.consents (player_id, guardian_id, consent_version)
  select id, 'a8000000-0000-0000-0000-00000000000a', 'v1-draft' from public.players where id::text like '88000000%' and user_id is distinct from 'e8000000-0000-0000-0000-00000000000e';

-- A match for Solo with a video and a clip at the video service, and one for the adult.
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position, status, published_at) values
  ('8a000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', current_date, '4-4-2', 'Red', 7, 'RM', 'published', now()),
  ('8a000000-0000-0000-0000-000000000004', '88000000-0000-0000-0000-000000000004', current_date, '4-4-2', 'Red', 9, 'RST', 'uploading', null);
insert into public.match_videos (id, match_id, half, provider_asset_id, status) values
  ('8b000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-000000000001', 'first', 'solo_video', 'ready'),
  ('8b000000-0000-0000-0000-000000000004', '8a000000-0000-0000-0000-000000000004', 'first', 'adult_video', 'ready');
insert into public.clips (match_id, video_id, start_seconds, end_seconds, strength_note, status, provider_asset_id)
  values ('8a000000-0000-0000-0000-000000000001', '8b000000-0000-0000-0000-000000000001', 10, 20, 'x', 'published', 'solo_clip');

-- ===================== Server-only functions =====================
select tests.login('a8000000-0000-0000-0000-00000000000a');
select throws_ok($$select * from public.next_provider_deletions(10)$$, '42501', null, 'a logged-in user cannot read the deletion list');
select throws_ok($$select public.expire_full_videos()$$, '42501', null, 'a logged-in user cannot run the 60-day clean-up');

-- ===================== Teens and the last admin can't delete themselves =====================
select tests.login('d8000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.delete_my_data()$$, '42501', null, 'a teen is told to ask their parent');
select tests.login('f8000000-0000-0000-0000-00000000000f');
select throws_ok($$select public.delete_my_data()$$, '22023', null, 'the only admin cannot delete their account');

-- ===================== Parent deletes their data =====================
select tests.login('a8000000-0000-0000-0000-00000000000a');
select is(public.delete_my_data(), array['d8000000-0000-0000-0000-00000000000d']::uuid[],
  'parent''s data is deleted and the teen''s login is handed back to be deleted too');
reset role;
select is((select count(*)::int from public.players where id = '88000000-0000-0000-0000-000000000001'), 0, 'their only child is deleted');
select is((select count(*)::int from public.players where id = '88000000-0000-0000-0000-000000000003'), 0, 'their teen''s profile is deleted');
select is((select count(*)::int from public.players where id = '88000000-0000-0000-0000-000000000002'), 1,
  'a child shared with another parent is kept (for the other parent)');
select is((select count(*)::int from public.guardianships where guardian_id = 'a8000000-0000-0000-0000-00000000000a'), 0,
  'the parent is no longer linked to any child');
select is((select count(*)::int from public.matches where id = '8a000000-0000-0000-0000-000000000001'), 0, 'the child''s match is deleted');
select results_eq(
  $$select coalesce(asset_id, upload_id) from private.provider_deletions where asset_id in ('solo_video', 'solo_clip') order by 1$$,
  array['solo_clip', 'solo_video'], 'the video and clip files are on the deletion list');

-- ===================== Adult player deletes their data =====================
select tests.login('e8000000-0000-0000-0000-00000000000e');
select is(public.delete_my_data(), '{}'::uuid[], 'adult player''s data is deleted');
reset role;
select is((select count(*)::int from public.players where user_id = 'e8000000-0000-0000-0000-00000000000e'), 0, 'their player profile is gone');
select is((select count(*)::int from private.provider_deletions where asset_id = 'adult_video'), 1, 'their video is on the deletion list');

-- ===================== Safety net =====================
insert into auth.users (id, email) values ('e9000000-0000-0000-0000-00000000000e', 'adult9@test.local');
insert into public.players (id, first_name, birth_year, user_id)
  values ('89000000-0000-0000-0000-000000000009', 'Loose', extract(year from now())::int - 30, 'e9000000-0000-0000-0000-00000000000e');
delete from auth.users where id = 'e9000000-0000-0000-0000-00000000000e';
select is((select count(*)::int from public.players where id = '89000000-0000-0000-0000-000000000009'), 0,
  'if an adult''s login is removed any other way, their player data goes too');

-- ===================== The deletion list, as the server sees it =====================
select tests.as_server();
select ok((select count(*) from public.next_provider_deletions(500) where asset_id = 'solo_video') = 1, 'the server can read the deletion list');
select public.finish_provider_deletion((select id from public.next_provider_deletions(500) where asset_id = 'solo_video'), null);
select ok(not exists (select 1 from public.next_provider_deletions(500) where asset_id = 'solo_video'), 'a finished deletion leaves the list');
select public.finish_provider_deletion((select id from public.next_provider_deletions(500) where asset_id = 'solo_clip'), 'Mux unreachable');
select ok(exists (select 1 from public.next_provider_deletions(500) where asset_id = 'solo_clip' and attempts = 1),
  'a failed deletion stays on the list to retry');
reset role;

-- ===================== 60-day clean-up =====================
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position, status)
  values ('8a000000-0000-0000-0000-000000000002', '88000000-0000-0000-0000-000000000002', current_date, '4-4-2', 'Red', 4, 'RCB', 'published');
insert into public.match_videos (id, match_id, half, provider_asset_id, status, delete_after) values
  ('8b000000-0000-0000-0000-000000000021', '8a000000-0000-0000-0000-000000000002', 'first', 'old_video', 'ready', now() - interval '1 day'),
  ('8b000000-0000-0000-0000-000000000022', '8a000000-0000-0000-0000-000000000002', 'second', 'waiting_video', 'ready', now() - interval '1 day');
insert into public.clips (match_id, video_id, start_seconds, end_seconds, strength_note, status, provider_asset_id) values
  ('8a000000-0000-0000-0000-000000000002', '8b000000-0000-0000-0000-000000000021', 10, 20, 'cut', 'published', 'cut_clip'),
  ('8a000000-0000-0000-0000-000000000002', '8b000000-0000-0000-0000-000000000022', 10, 20, 'not cut yet', 'published', null);
select tests.as_server();
select public.expire_full_videos();
reset role;
select results_eq($$select half from public.match_videos where match_id = '8a000000-0000-0000-0000-000000000002'$$,
  array['second'], 'old full videos are removed, but not one whose clip hasn''t been cut yet');
select is((select count(*)::int from public.clips where match_id = '8a000000-0000-0000-0000-000000000002'), 2, 'the clips are kept');

select * from finish();
rollback;
