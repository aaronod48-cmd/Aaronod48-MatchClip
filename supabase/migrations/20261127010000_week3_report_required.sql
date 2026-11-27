-- =====================================================================
-- Week 3, Step 2: a report is required for the first publish
-- (the report screen now exists). Publishing again still allows a report
-- written later for a match published before reports existed.
-- =====================================================================

create or replace function public.publish_match(p_match uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  published int;
  was text := (select status from public.matches where id = p_match);
  rep public.reports;
  problem text;
begin
  if not private.is_assigned_coach(private.match_player(p_match)) then
    raise exception 'Only the player''s coach can do that.' using errcode = '42501';
  end if;
  if was not in ('waiting_for_coach', 'in_review', 'published') then
    raise exception 'This match isn''t ready to publish.' using errcode = '22023';
  end if;
  select * into rep from public.reports where match_id = p_match;

  if was <> 'published' then
    -- First publish: the clips AND a complete report.
    if not exists (select 1 from public.clips where match_id = p_match and status = 'draft' and strength_note is not null) then
      raise exception 'Add at least one clip with a strength note before publishing.' using errcode = '22023';
    end if;
    if rep.id is null then
      raise exception 'Write the report before publishing.' using errcode = '22023';
    end if;
  else
    -- Publishing again: new clips and/or a report written later.
    if not exists (select 1 from public.clips where match_id = p_match and status = 'draft' and strength_note is not null)
       and (rep.id is null or rep.status = 'published') then
      raise exception 'Nothing new to publish.' using errcode = '22023';
    end if;
  end if;

  if rep.id is not null and rep.status = 'draft' then
    problem := private.report_problem(rep.id);
    if problem is not null then
      raise exception '%', problem using errcode = '22023';
    end if;
    update public.reports set status = 'published', published_at = now() where id = rep.id;
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

