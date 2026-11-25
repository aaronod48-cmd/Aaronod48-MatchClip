-- =====================================================================
-- Week 2, Step 1: matches, videos, clips and tags
--
-- Plain-English summary
--   matches            one per match: date, opponent, shape, kit colour,
--                      shirt number, position, the "tap yourself" point, status
--   match_videos       first half + second half, with the video service's ids
--   clips              the coach's clips: times, hand-placed ring, notes,
--                      draft or published
--   clip_tags          tags on each clip; who set it (ai or coach) and which
--                      coach confirmed it
--   app_settings       the default coach; new players are assigned to them
--   private.provider_deletions
--                      a private to-do list: every deleted video/clip file is
--                      queued here so the server deletes it at the video
--                      service too (Step 6). Deleting really deletes.
--
-- Who sees what (row-level security)
--   Player / parent:  their matches and videos; ONLY published clips; ONLY
--                     coach-confirmed tags on those clips. Nothing from AI
--                     ever reaches a player.
--   Assigned coach:   matches, videos and all clips of their players (for
--                     under-18s only while consent is active). Every time they
--                     open a minor's video it is logged (record_media_view).
--   Admin:            no automatic access to matches or videos, unless also
--                     assigned as the player's coach.
--   Not logged in:    nothing.
-- =====================================================================

-- ---------- Positions for each team shape (must match src/config/formations.ts) ----------

create function private.valid_position(p_shape text, p_position text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_shape
    when '4-4-2' then p_position = any (array['GK','RB','RCB','LCB','LB','RM','RCM','LCM','LM','RST','LST'])
    when '4-3-3' then p_position = any (array['GK','RB','RCB','LCB','LB','RCM','CM','LCM','RW','ST','LW'])
    else false
  end
$$;

create function private.full_video_keep_days() returns int
language sql immutable set search_path = '' as $$ select 60 $$;

create function private.max_half_seconds() returns int
language sql immutable set search_path = '' as $$ select 60 * 60 $$;

-- ---------- Settings: the default coach ----------

create table public.app_settings (
  id               boolean primary key default true check (id), -- exactly one row
  default_coach_id uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

-- Only a coach or admin can be the default coach.
create function private.check_default_coach() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_coach_id is not null and not exists (
    select 1 from public.profiles where id = new.default_coach_id and role in ('coach', 'admin')
  ) then
    raise exception 'The default coach must be a coach or admin account.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger app_settings_check before update on public.app_settings
  for each row execute function private.check_default_coach();

-- Give a player to the default coach (if one is set and they have no coach yet).
create function private.assign_default_coach(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  coach uuid := (select default_coach_id from public.app_settings where id);
begin
  if coach is null then return; end if;
  if exists (select 1 from public.coach_assignments where player_id = p_player and ended_at is null) then return; end if;
  insert into public.coach_assignments (coach_id, player_id, organisation_id)
  values (coach, p_player, (select id from public.organisations where kind = 'independent' order by created_at limit 1));
end;
$$;

create function private.on_player_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assign_default_coach(new.id);
  return new;
end;
$$;
create trigger players_assign_default_coach after insert on public.players
  for each row execute function private.on_player_created();

-- When a default coach is first set (or changed), give them every player without a coach.
create function private.on_default_coach_set() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.default_coach_id is distinct from old.default_coach_id and new.default_coach_id is not null then
    for p in select id from public.players loop
      perform private.assign_default_coach(p.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger app_settings_backfill after update on public.app_settings
  for each row execute function private.on_default_coach_set();

-- ---------- matches ----------

create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references public.players (id) on delete cascade,
  uploaded_by      uuid references auth.users (id) on delete set null,
  match_date       date not null,
  opponent         text check (char_length(opponent) <= 80),
  team_shape       text not null check (team_shape in ('4-4-2', '4-3-3')),
  kit_colour       text not null check (char_length(trim(kit_colour)) between 1 and 40),
  shirt_number     smallint not null check (shirt_number between 1 and 99),
  position         text not null,
  -- "Tap yourself": which half, how far into it, and where on the frame (0-1).
  tap_half         text check (tap_half in ('first', 'second')),
  tap_seconds      numeric(7, 2) check (tap_seconds >= 0),
  tap_x            numeric(5, 4) check (tap_x between 0 and 1),
  tap_y            numeric(5, 4) check (tap_y between 0 and 1),
  status           text not null default 'uploading'
                   check (status in ('uploading', 'waiting_for_coach', 'in_review', 'published')),
  submitted_at     timestamptz,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (private.valid_position(team_shape, position))
);
create index matches_player_idx on public.matches (player_id, match_date desc);
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------- match_videos ----------

create table public.match_videos (
  id                    uuid primary key default gen_random_uuid(),
  match_id              uuid not null references public.matches (id) on delete cascade,
  half                  text not null check (half in ('first', 'second')),
  provider              text not null default 'mux',
  provider_upload_id    text,
  provider_asset_id     text,
  provider_playback_id  text,
  status                text not null default 'waiting_upload'
                        check (status in ('waiting_upload', 'processing', 'ready', 'errored')),
  duration_seconds      numeric(8, 2) check (duration_seconds between 0 and private.max_half_seconds()),
  delete_after          timestamptz, -- set when the coach publishes: full video is removed after this
  created_at            timestamptz not null default now(),
  unique (match_id, half)
);

-- ---------- clips ----------

create table public.clips (
  id                    uuid primary key default gen_random_uuid(),
  match_id              uuid not null references public.matches (id) on delete cascade,
  video_id              uuid references public.match_videos (id) on delete set null,
  start_seconds         numeric(7, 2) not null check (start_seconds >= 0),
  end_seconds           numeric(7, 2) not null,
  -- The tracking ring, placed by hand by the coach: when (seconds into the clip) and where (0-1).
  ring_seconds          numeric(7, 2),
  ring_x                numeric(5, 4) check (ring_x between 0 and 1),
  ring_y                numeric(5, 4) check (ring_y between 0 and 1),
  strength_note         text check (char_length(strength_note) <= 500),
  workon_note           text check (char_length(workon_note) <= 500),
  status                text not null default 'draft' check (status in ('draft', 'published')),
  provider_asset_id     text,
  provider_playback_id  text,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (end_seconds - start_seconds between 2 and 60),
  check (ring_seconds is null or (ring_seconds >= 0 and ring_seconds <= end_seconds - start_seconds))
);
create index clips_match_idx on public.clips (match_id, start_seconds);
create trigger clips_updated_at before update on public.clips
  for each row execute function public.set_updated_at();

-- ---------- clip_tags ----------

create table public.clip_tags (
  clip_id       uuid not null references public.clips (id) on delete cascade,
  tag_id        uuid not null references public.tags (id) on delete cascade,
  source        public.tag_source not null default 'coach', -- who set it: ai or coach
  confirmed_by  uuid references public.profiles (id) on delete set null, -- coach who confirmed it
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (clip_id, tag_id),
  check ((confirmed_by is null) = (confirmed_at is null))
);
create index clip_tags_tag_idx on public.clip_tags (tag_id);

-- ---------- Files to delete at the video service (private) ----------

create table private.provider_deletions (
  id            bigint generated always as identity primary key,
  provider      text not null,
  asset_id      text,
  upload_id     text,
  kind          text not null, -- 'match_video' or 'clip'
  requested_at  timestamptz not null default now(),
  done_at       timestamptz,
  last_error    text
);

create function private.queue_video_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.provider_asset_id is not null or old.provider_upload_id is not null then
    insert into private.provider_deletions (provider, asset_id, upload_id, kind)
    values (old.provider, old.provider_asset_id, old.provider_upload_id, 'match_video');
  end if;
  return old;
end;
$$;
create trigger match_videos_queue_delete after delete on public.match_videos
  for each row execute function private.queue_video_deletion();

create function private.queue_clip_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.provider_asset_id is not null then
    insert into private.provider_deletions (provider, asset_id, kind)
    values ('mux', old.provider_asset_id, 'clip');
  end if;
  return old;
end;
$$;
create trigger clips_queue_delete after delete on public.clips
  for each row execute function private.queue_clip_deletion();

-- ---------- Helpers ----------

create function private.match_player(p_match uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select player_id from public.matches where id = p_match
$$;

-- Parent, or the player themselves; for under-18s only with active consent.
create function private.can_upload_for(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.is_guardian_of(p_player) or private.is_player_self(p_player))
     and (not private.is_minor(p_player) or private.has_active_consent(p_player))
$$;

-- ---------- Functions the app calls ----------

-- An adult player (18+) creates their own player record, the first time they upload.
create function public.create_my_player_profile(p_birth_year int, p_team_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  this_year int := extract(year from now())::int;
  new_id uuid;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and role = 'player') then
    raise exception 'Only a player account can do this.' using errcode = '42501';
  end if;
  if exists (select 1 from public.players where user_id = me) then
    raise exception 'You already have a player profile.' using errcode = '22023';
  end if;
  if p_birth_year is null or this_year - p_birth_year - 1 < private.adult_age() or this_year - p_birth_year > 100 then
    raise exception 'Please check your birth year. Players under 18 are added by a parent or guardian.' using errcode = '22023';
  end if;
  insert into public.players (user_id, first_name, birth_year, team_name, created_by)
  values (
    me,
    coalesce(nullif(trim((select display_name from public.profiles where id = me)), ''), 'Player'),
    p_birth_year,
    nullif(left(trim(coalesce(p_team_name, '')), 80), ''),
    me
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Start a new match: saves the details and makes the two half-video slots.
create function public.create_match(
  p_player uuid, p_match_date date, p_opponent text, p_team_shape text,
  p_kit_colour text, p_shirt_number int, p_position text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not private.can_upload_for(p_player) then
    raise exception 'You can only add matches for yourself or your own child (with consent).' using errcode = '42501';
  end if;
  if p_match_date is null or p_match_date > current_date + 1 or p_match_date < current_date - 365 then
    raise exception 'Please check the match date (within the last year).' using errcode = '22023';
  end if;
  if p_team_shape is null or p_team_shape not in ('4-4-2', '4-3-3') then
    raise exception 'Please choose your team''s shape.' using errcode = '22023';
  end if;
  if not private.valid_position(p_team_shape, p_position) then
    raise exception 'Please choose your position.' using errcode = '22023';
  end if;
  if p_shirt_number is null or p_shirt_number not between 1 and 99 then
    raise exception 'Please enter a shirt number from 1 to 99.' using errcode = '22023';
  end if;
  if p_kit_colour is null or char_length(trim(p_kit_colour)) not between 1 and 40 then
    raise exception 'Please describe your kit colour.' using errcode = '22023';
  end if;

  insert into public.matches (player_id, uploaded_by, match_date, opponent, team_shape, kit_colour, shirt_number, position)
  values (p_player, (select auth.uid()), p_match_date, nullif(left(trim(coalesce(p_opponent, '')), 80), ''),
          p_team_shape, trim(p_kit_colour), p_shirt_number, p_position)
  returning id into new_id;

  insert into public.match_videos (match_id, half) values (new_id, 'first'), (new_id, 'second');
  return new_id;
end;
$$;

-- "Tap yourself": record where the player is on a frame.
create function public.set_match_tap(p_match uuid, p_half text, p_seconds numeric, p_x numeric, p_y numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_upload_for(private.match_player(p_match)) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if (select status from public.matches where id = p_match) not in ('uploading', 'waiting_for_coach') then
    raise exception 'This match is already with the coach.' using errcode = '22023';
  end if;
  if p_half not in ('first', 'second') or p_seconds is null or p_seconds < 0
     or p_x is null or p_y is null or p_x not between 0 and 1 or p_y not between 0 and 1 then
    raise exception 'Please tap on the picture to show where you are.' using errcode = '22023';
  end if;
  update public.matches
  set tap_half = p_half, tap_seconds = p_seconds, tap_x = p_x, tap_y = p_y
  where id = p_match;
end;
$$;

-- Send to the coach: needs the tap and at least one uploaded half.
create function public.submit_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or not private.can_upload_for(m.player_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if m.status <> 'uploading' then
    raise exception 'This match has already been sent to the coach.' using errcode = '22023';
  end if;
  if m.tap_x is null then
    raise exception 'Please tap yourself first.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.match_videos where match_id = p_match and status in ('processing', 'ready')) then
    raise exception 'Please upload at least one half first.' using errcode = '22023';
  end if;
  update public.matches set status = 'waiting_for_coach', submitted_at = now() where id = p_match;
end;
$$;

-- Coach: start reviewing, and publish (clips go live; full video deleted after 60 days).
create function public.start_review(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_assigned_coach(private.match_player(p_match)) then
    raise exception 'Only the player''s coach can do that.' using errcode = '42501';
  end if;
  update public.matches set status = 'in_review' where id = p_match and status = 'waiting_for_coach';
end;
$$;

create function public.publish_match(p_match uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare published int;
begin
  if not private.is_assigned_coach(private.match_player(p_match)) then
    raise exception 'Only the player''s coach can do that.' using errcode = '42501';
  end if;
  if (select status from public.matches where id = p_match) not in ('waiting_for_coach', 'in_review') then
    raise exception 'This match isn''t ready to publish.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clips where match_id = p_match and strength_note is not null) then
    raise exception 'Add at least one clip with a strength note before publishing.' using errcode = '22023';
  end if;
  update public.clips set status = 'published' where match_id = p_match and status = 'draft';
  get diagnostics published = row_count;
  update public.matches set status = 'published', published_at = now() where id = p_match;
  update public.match_videos
  set delete_after = now() + make_interval(days => private.full_video_keep_days())
  where match_id = p_match;
  return published;
end;
$$;

-- Called by the server BEFORE it hands anyone a private playback link.
-- Refuses anyone not allowed to see the player, and logs staff views of a minor's media.
create function public.record_media_view(p_match uuid, p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  player uuid := private.match_player(p_match);
  me uuid := (select auth.uid());
begin
  if player is null or not private.can_view_player(player) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_kind not in ('view_video', 'view_clip') then
    raise exception 'Unknown view type.' using errcode = '22023';
  end if;
  -- Players and their parents can only open PUBLISHED clips.
  if p_kind = 'view_clip' and not private.is_assigned_coach(player)
     and not exists (select 1 from public.clips where id = p_target and match_id = p_match and status = 'published') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if private.is_assigned_coach(player)
     and not private.is_guardian_of(player) and not private.is_player_self(player)
     and private.is_minor(player) then
    insert into public.staff_access_log (staff_id, player_id, action, target_type, target_id)
    values (me, player, p_kind, case when p_kind = 'view_video' then 'match_video' else 'clip' end, p_target);
  end if;
end;
$$;

-- ---------- Permissions ----------

revoke all on public.app_settings, public.matches, public.match_videos, public.clips, public.clip_tags from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.app_settings, public.matches, public.match_videos, public.clips, public.clip_tags from authenticated;

grant update (default_coach_id) on public.app_settings to authenticated;
grant update (match_date, opponent, kit_colour, shirt_number) on public.matches to authenticated;
grant delete on public.matches to authenticated;
grant insert (match_id, video_id, start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note)
  on public.clips to authenticated;
grant update (start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note)
  on public.clips to authenticated;
grant delete on public.clips to authenticated;
grant insert (clip_id, tag_id, confirmed_by, confirmed_at) on public.clip_tags to authenticated;
grant update (confirmed_by, confirmed_at) on public.clip_tags to authenticated;
grant delete on public.clip_tags to authenticated;

revoke all on table private.provider_deletions from public, anon, authenticated;
revoke all on sequence private.provider_deletions_id_seq from public, anon, authenticated;
grant select, update on private.provider_deletions to service_role;
grant usage on schema private to service_role;

revoke execute on function public.create_my_player_profile(int, text) from public, anon;
revoke execute on function public.create_match(uuid, date, text, text, text, int, text) from public, anon;
revoke execute on function public.set_match_tap(uuid, text, numeric, numeric, numeric) from public, anon;
revoke execute on function public.submit_match(uuid) from public, anon;
revoke execute on function public.start_review(uuid) from public, anon;
revoke execute on function public.publish_match(uuid) from public, anon;
revoke execute on function public.record_media_view(uuid, text, uuid) from public, anon;
grant execute on function public.create_my_player_profile(int, text) to authenticated;
grant execute on function public.create_match(uuid, date, text, text, text, int, text) to authenticated;
grant execute on function public.set_match_tap(uuid, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.submit_match(uuid) to authenticated;
grant execute on function public.start_review(uuid) to authenticated;
grant execute on function public.publish_match(uuid) to authenticated;
grant execute on function public.record_media_view(uuid, text, uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------- Row-level security ----------

alter table public.app_settings enable row level security;
alter table public.matches      enable row level security;
alter table public.match_videos enable row level security;
alter table public.clips        enable row level security;
alter table public.clip_tags    enable row level security;
alter table private.provider_deletions enable row level security;

create policy "app_settings: logged-in users can read"
  on public.app_settings for select to authenticated using (true);
create policy "app_settings: admin edits"
  on public.app_settings for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy "matches: player, parent and assigned coach can see"
  on public.matches for select to authenticated
  using (private.can_view_player(player_id));
create policy "matches: parent or player edits details before review"
  on public.matches for update to authenticated
  using (private.can_upload_for(player_id) and status in ('uploading', 'waiting_for_coach'))
  with check (private.can_upload_for(player_id));
create policy "matches: parent, or adult player, can delete"
  on public.matches for delete to authenticated
  using (private.is_guardian_of(player_id) or (private.is_player_self(player_id) and not private.is_minor(player_id)));

create policy "match_videos: same people as the match"
  on public.match_videos for select to authenticated
  using (private.can_view_player(private.match_player(match_id)));

create policy "clips: coach sees all; player and parent see published"
  on public.clips for select to authenticated
  using (
    private.is_assigned_coach(private.match_player(match_id))
    or (status = 'published' and private.can_view_player(private.match_player(match_id)))
  );
create policy "clips: assigned coach creates"
  on public.clips for insert to authenticated
  with check (private.is_assigned_coach(private.match_player(match_id)) and status = 'draft');
create policy "clips: assigned coach edits"
  on public.clips for update to authenticated
  using (private.is_assigned_coach(private.match_player(match_id)))
  with check (private.is_assigned_coach(private.match_player(match_id)));
create policy "clips: assigned coach deletes"
  on public.clips for delete to authenticated
  using (private.is_assigned_coach(private.match_player(match_id)));

create function private.clip_match(p_clip uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select match_id from public.clips where id = p_clip
$$;
grant execute on function private.clip_match(uuid) to authenticated;
revoke execute on function private.clip_match(uuid) from public, anon;

create policy "clip_tags: coach sees all; others see confirmed tags if published"
  on public.clip_tags for select to authenticated
  using (
    private.is_assigned_coach(private.match_player(private.clip_match(clip_id)))
    or (
      confirmed_by is not null
      and exists (select 1 from public.clips c where c.id = clip_id and c.status = 'published')
      and private.can_view_player(private.match_player(private.clip_match(clip_id)))
    )
  );
create policy "clip_tags: assigned coach adds confirmed coach tags"
  on public.clip_tags for insert to authenticated
  with check (
    private.is_assigned_coach(private.match_player(private.clip_match(clip_id)))
    and source = 'coach' and confirmed_by = (select auth.uid())
  );
create policy "clip_tags: assigned coach confirms"
  on public.clip_tags for update to authenticated
  using (private.is_assigned_coach(private.match_player(private.clip_match(clip_id))))
  with check (
    private.is_assigned_coach(private.match_player(private.clip_match(clip_id)))
    and (confirmed_by is null or confirmed_by = (select auth.uid()))
  );
create policy "clip_tags: assigned coach removes"
  on public.clip_tags for delete to authenticated
  using (private.is_assigned_coach(private.match_player(private.clip_match(clip_id))));
