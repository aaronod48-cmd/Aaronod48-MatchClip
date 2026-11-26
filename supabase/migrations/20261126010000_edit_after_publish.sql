-- =====================================================================
-- Editing after publishing (owner's request)
--
--   publish_match   can now be run again on a published match: it publishes
--                   any NEW draft clips. The first publish still sets the
--                   publish date and the 60-day deletion date for the full
--                   video; later publishes don't move those dates.
--   Clip times      are locked once a clip is published (it has been cut as
--                   its own video). Tags, notes and the ring can still change.
-- =====================================================================

create or replace function public.publish_match(p_match uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  published int;
  was text := (select status from public.matches where id = p_match);
begin
  if not private.is_assigned_coach(private.match_player(p_match)) then
    raise exception 'Only the player''s coach can do that.' using errcode = '42501';
  end if;
  if was not in ('waiting_for_coach', 'in_review', 'published') then
    raise exception 'This match isn''t ready to publish.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clips where match_id = p_match and status = 'draft' and strength_note is not null) then
    raise exception 'Add at least one new clip with a strength note before publishing.' using errcode = '22023';
  end if;

  update public.clips set status = 'published' where match_id = p_match and status = 'draft';
  get diagnostics published = row_count;

  if was <> 'published' then
    update public.matches set status = 'published', published_at = now() where id = p_match;
    update public.match_videos
    set delete_after = now() + make_interval(days => private.full_video_keep_days())
    where match_id = p_match;
  end if;
  return published;
end;
$$;

create function private.lock_published_clip_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published'
     and (new.start_seconds is distinct from old.start_seconds or new.end_seconds is distinct from old.end_seconds) then
    raise exception 'A published clip''s times can''t change. Delete it and make a new clip instead.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger clips_lock_published_times
  before update on public.clips
  for each row execute function private.lock_published_clip_times();

revoke execute on function private.lock_published_clip_times() from public, anon;
grant execute on function private.lock_published_clip_times() to authenticated, service_role;
