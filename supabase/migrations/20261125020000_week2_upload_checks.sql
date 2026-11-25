-- =====================================================================
-- Week 2, Step 2: checks before a half is uploaded
--
-- prepare_video_upload  run as the logged-in person BEFORE the server asks
--                       the video service for an upload address. Checks they
--                       may upload for this player, the match hasn't gone to
--                       the coach, and this half isn't already uploaded.
--                       Re-trying a failed half queues the old file for
--                       deletion first. Returns the video slot's id.
-- =====================================================================

create function public.prepare_video_upload(p_match uuid, p_half text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.match_videos;
begin
  if not private.can_upload_for(private.match_player(p_match)) then
    raise exception 'You can only upload for yourself or your own child (with consent).' using errcode = '42501';
  end if;
  if (select status from public.matches where id = p_match) <> 'uploading' then
    raise exception 'This match has already been sent to the coach.' using errcode = '22023';
  end if;
  select * into v from public.match_videos where match_id = p_match and half = p_half;
  if v.id is null then
    raise exception 'Unknown half.' using errcode = '22023';
  end if;
  if v.status in ('processing', 'ready') then
    raise exception 'This half is already uploaded.' using errcode = '22023';
  end if;

  -- Starting again (e.g. after a failed or abandoned upload): forget the old one.
  if v.provider_upload_id is not null or v.provider_asset_id is not null then
    insert into private.provider_deletions (provider, asset_id, upload_id, kind)
    values (v.provider, v.provider_asset_id, v.provider_upload_id, 'match_video');
    update public.match_videos
    set provider_upload_id = null, provider_asset_id = null, provider_playback_id = null,
        status = 'waiting_upload', duration_seconds = null
    where id = v.id;
  end if;
  return v.id;
end;
$$;

revoke execute on function public.prepare_video_upload(uuid, text) from public, anon;
grant execute on function public.prepare_video_upload(uuid, text) to authenticated;

-- The server (secret key) records upload progress on match_videos. Those
-- tables' built-in checks (e.g. "at most 60 minutes", "valid position") use
-- small helper functions, so the server must be allowed to run them.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
