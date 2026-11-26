-- =====================================================================
-- Week 2, Step 6: deleting really deletes
--
-- Server-only (secret key) functions for the deletion to-do list:
--   next_provider_deletions   files waiting to be deleted at the video service
--   finish_provider_deletion  mark one done (or record why it failed)
--   expire_full_videos        remove full match videos 60 days after
--                             publishing (clips are kept). Only once every
--                             published clip has been cut as its own video.
--
-- For the logged-in person:
--   delete_my_data            removes everything the person owns BEFORE their
--                             login is deleted, and returns the logins of
--                             their teens that must be deleted too.
--
-- Safety net:
--   A player whose own login disappears, and who has no parent/guardian,
--   is deleted too (no data left behind with nobody responsible for it).
-- =====================================================================

alter table private.provider_deletions add column attempts int not null default 0;

create function public.next_provider_deletions(p_limit int default 50)
returns table (id bigint, provider text, asset_id text, upload_id text, kind text, attempts int)
language sql security definer set search_path = '' as $$
  select id, provider, asset_id, upload_id, kind, attempts
  from private.provider_deletions
  where done_at is null and attempts < 20
  order by requested_at
  limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

create function public.finish_provider_deletion(p_id bigint, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_error is null then
    update private.provider_deletions set done_at = now(), last_error = null where id = p_id;
  else
    update private.provider_deletions set attempts = attempts + 1, last_error = left(p_error, 500) where id = p_id;
  end if;
end;
$$;

create function public.expire_full_videos() returns int
language plpgsql security definer set search_path = '' as $$
declare removed int;
begin
  delete from public.match_videos v
  where v.delete_after is not null
    and v.delete_after < now()
    and not exists (
      -- keep the full video until every published clip from it has its own video
      select 1 from public.clips c
      where c.video_id = v.id and c.status = 'published' and c.provider_asset_id is null
    );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.next_provider_deletions(int) from public, anon, authenticated;
revoke execute on function public.finish_provider_deletion(bigint, text) from public, anon, authenticated;
revoke execute on function public.expire_full_videos() from public, anon, authenticated;
grant execute on function public.next_provider_deletions(int) to service_role;
grant execute on function public.finish_provider_deletion(bigint, text) to service_role;
grant execute on function public.expire_full_videos() to service_role;

-- ---------- Delete my account: the data part ----------

create function public.delete_my_data() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  my_role public.app_role;
  teen_logins uuid[] := '{}';
  child record;
begin
  if me is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;
  select role into my_role from public.profiles where id = me;

  -- Teens: their parent controls their data.
  if exists (select 1 from public.players p where p.user_id = me and private.is_minor(p.id)) then
    raise exception 'Please ask your parent or guardian. They can remove your login or delete your profile.'
      using errcode = '42501';
  end if;

  -- Never remove the last admin.
  if my_role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'You are the only admin. Make someone else an admin first.' using errcode = '22023';
  end if;

  -- Parent: delete each child who has no other parent/guardian (and remember their teen login).
  for child in
    select p.id, p.user_id from public.players p
    join public.guardianships g on g.player_id = p.id and g.guardian_id = me
  loop
    if exists (select 1 from public.guardianships g2 where g2.player_id = child.id and g2.guardian_id <> me) then
      delete from public.guardianships where player_id = child.id and guardian_id = me;
    else
      if child.user_id is not null then
        teen_logins := array_append(teen_logins, child.user_id);
      end if;
      delete from public.players where id = child.id; -- matches, videos, clips, consents go with it
    end if;
  end loop;

  -- Adult player: their own player profile and everything in it.
  delete from public.players where user_id = me;

  return teen_logins;
end;
$$;

revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

-- ---------- Safety net: a player left with no login and no guardian is removed ----------

create function private.delete_unowned_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id is not null and new.user_id is null
     and not exists (select 1 from public.guardianships where player_id = new.id) then
    delete from public.players where id = new.id;
  end if;
  return null;
end;
$$;

create trigger players_delete_unowned
  after update of user_id on public.players
  for each row execute function private.delete_unowned_player();

revoke execute on function private.delete_unowned_player() from public, anon;
grant execute on function private.delete_unowned_player() to authenticated, service_role;
