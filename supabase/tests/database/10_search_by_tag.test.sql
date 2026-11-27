-- Week 3 Step 5 checks: searching clips by tag only ever returns clips the
-- signed-in person may see, and only coach-confirmed tags count.
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

-- The same query the search page uses: clips with a coach-confirmed tag.
create function tests.search(p_tag text) returns setof text language sql as $$
  select c.strength_note
  from public.clip_tags ct
  join public.clips c on c.id = ct.clip_id
  join public.tags t on t.id = ct.tag_id
  where t.name = p_tag and ct.confirmed_by is not null
  order by c.strength_note
$$;
grant execute on function tests.search(text) to authenticated;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'pa10@test.local'),
  ('b1000000-0000-0000-0000-00000000000b', 'pb10@test.local'),
  ('c1000000-0000-0000-0000-00000000000c', 'cc10@test.local'),
  ('c1000000-0000-0000-0000-00000000000d', 'cd10@test.local');
update public.profiles set role = 'coach' where id::text like 'c1000000%';

insert into public.players (id, first_name, birth_year) values
  ('10100000-0000-0000-0000-000000000001', 'Amy', extract(year from now())::int - 10),
  ('10100000-0000-0000-0000-000000000002', 'Ben', extract(year from now())::int - 10);
insert into public.guardianships values
  ('a1000000-0000-0000-0000-00000000000a', '10100000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-00000000000b', '10100000-0000-0000-0000-000000000002');
insert into public.consents (player_id, guardian_id, consent_version) values
  ('10100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'v1-draft'),
  ('10100000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000b', 'v1-draft');
insert into public.coach_assignments (coach_id, player_id) values
  ('c1000000-0000-0000-0000-00000000000c', '10100000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-00000000000c', '10100000-0000-0000-0000-000000000002');
insert into public.matches (id, player_id, match_date, team_shape, kit_colour, shirt_number, position, status) values
  ('1a100000-0000-0000-0000-000000000001', '10100000-0000-0000-0000-000000000001', current_date, '4-4-2', 'Red', 7, 'RM', 'published'),
  ('1a100000-0000-0000-0000-000000000002', '10100000-0000-0000-0000-000000000002', current_date, '4-4-2', 'Blue', 4, 'RCB', 'published');
insert into public.clips (id, match_id, start_seconds, end_seconds, strength_note, status) values
  ('1c100000-0000-0000-0000-000000000001', '1a100000-0000-0000-0000-000000000001', 10, 20, 'Amy published', 'published'),
  ('1c100000-0000-0000-0000-000000000002', '1a100000-0000-0000-0000-000000000001', 30, 40, 'Amy draft', 'draft'),
  ('1c100000-0000-0000-0000-000000000003', '1a100000-0000-0000-0000-000000000001', 50, 60, 'Amy AI only', 'published'),
  ('1c100000-0000-0000-0000-000000000004', '1a100000-0000-0000-0000-000000000002', 10, 20, 'Ben published', 'published');
insert into public.clip_tags (clip_id, tag_id, source, confirmed_by, confirmed_at)
  select c.id, (select id from public.tags where name = 'Duels'),
         case when c.strength_note = 'Amy AI only' then 'ai'::public.tag_source else 'coach'::public.tag_source end,
         case when c.strength_note = 'Amy AI only' then null else 'c1000000-0000-0000-0000-00000000000c'::uuid end,
         case when c.strength_note = 'Amy AI only' then null else now() end
  from public.clips c where c.id::text like '1c100000%';

select tests.login('c1000000-0000-0000-0000-00000000000c');
select results_eq($$select s from tests.search('Duels') s where s in ('Amy published', 'Amy draft', 'Amy AI only', 'Ben published')$$,
  array['Amy draft', 'Amy published', 'Ben published'],
  'the coach finds all their players'' clips, drafts included (but not the unconfirmed AI tag)');

select tests.login('a1000000-0000-0000-0000-00000000000a');
select results_eq($$select s from tests.search('Duels') s where s in ('Amy published', 'Amy draft', 'Amy AI only', 'Ben published')$$, array['Amy published'],
  'a parent finds only their own child''s published clips');
select ok(not exists (select 1 from tests.search('Duels') s where s = 'Ben published'), 'never another family''s clip');
select ok(not exists (select 1 from tests.search('Duels') s where s = 'Amy draft'), 'never a draft');
select ok(not exists (select 1 from tests.search('Duels') s where s = 'Amy AI only'), 'never a clip found only by an unconfirmed AI tag');

select tests.login('b1000000-0000-0000-0000-00000000000b');
select results_eq($$select s from tests.search('Duels') s where s in ('Amy published', 'Amy draft', 'Amy AI only', 'Ben published')$$, array['Ben published'], 'the other parent finds only their own child');

select tests.login('c1000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from tests.search('Duels') s where s in ('Amy published', 'Amy draft', 'Amy AI only', 'Ben published')), 0, 'a coach not assigned to these players finds nothing');

-- Consent withdrawn: the coach stops finding that child's clips.
reset role;
update public.consents set withdrawn_at = now() where player_id = '10100000-0000-0000-0000-000000000001';
select tests.login('c1000000-0000-0000-0000-00000000000c');
select ok(not exists (select 1 from tests.search('Duels') s where s like 'Amy%'), 'after consent is withdrawn, the coach no longer finds that child''s clips');
select ok(exists (select 1 from tests.search('Duels') s where s = 'Ben published'), 'but still finds other players');

select * from finish();
rollback;
