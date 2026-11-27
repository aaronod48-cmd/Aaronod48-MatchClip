-- =====================================================================
-- Week 3, Step 1: reports, focus and sharing
--
-- Plain-English summary
--   score_categories  the list of score names (admin manages, like tags)
--   drills            the coach's drill library (coaches and admins only)
--   reports           one per match: draft until the coach publishes
--   report_scores     four scores out of 10 (category name copied in)
--   report_items      strengths and work-ons; each work-on carries a copy of
--                     its drill, so editing the library never changes a sent report
--   player_focus      "Set as my focus this week": one work-on per player per week
--   share_links       "Share with my coach": private links that expire. Only a
--                     scrambled version of each link's secret is stored.
--   share_link_views  every time a shared link is opened
--
-- Who sees what
--   Player / parent: their PUBLISHED report only; their focus; their share links
--                    (the parent sees and can stop every link for their child).
--   Assigned coach:  their players' reports (draft and published); writes them.
--   Anyone with a valid link: only that report or clip, only until it expires,
--                    only while consent is active (checked by the server).
-- =====================================================================

-- ---------- Score categories ----------

create table public.score_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(trim(name)) between 1 and 40),
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.score_categories (name, sort_order) values
  ('Passing', 1), ('Duels', 2), ('Positioning', 3), ('Decision making', 4);

-- ---------- Drill library ----------

create table public.drills (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 80),
  description text check (char_length(description) <= 1000),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger drills_updated_at before update on public.drills
  for each row execute function public.set_updated_at();

-- ---------- Reports ----------

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null unique references public.matches (id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

create table public.report_scores (
  report_id     uuid not null references public.reports (id) on delete cascade,
  slot          smallint not null check (slot between 1 and 4),
  category_id   uuid references public.score_categories (id) on delete set null,
  category_name text not null check (char_length(trim(category_name)) between 1 and 40),
  score         smallint not null check (score between 1 and 10),
  primary key (report_id, slot)
);

create table public.report_items (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.reports (id) on delete cascade,
  kind              text not null check (kind in ('strength', 'workon')),
  body              text not null check (char_length(trim(body)) between 1 and 500),
  sort_order        smallint not null default 0,
  drill_id          uuid references public.drills (id) on delete set null,
  drill_title       text check (char_length(drill_title) <= 80),
  drill_description text check (char_length(drill_description) <= 1000),
  created_at        timestamptz not null default now(),
  check (kind = 'workon' or (drill_id is null and drill_title is null and drill_description is null))
);
create index report_items_report_idx on public.report_items (report_id, kind, sort_order);

-- ---------- Focus ----------

create table public.player_focus (
  player_id      uuid not null references public.players (id) on delete cascade,
  week_start     date not null, -- Monday of the week, Sydney time
  report_item_id uuid not null references public.report_items (id) on delete cascade,
  set_by         uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (player_id, week_start)
);

-- ---------- Sharing ----------

create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique, -- sha256 of the secret in the link; the secret itself is never stored
  player_id   uuid not null references public.players (id) on delete cascade,
  match_id    uuid not null references public.matches (id) on delete cascade,
  kind        text not null check (kind in ('report', 'clip')),
  clip_id     uuid references public.clips (id) on delete cascade,
  note        text check (char_length(note) <= 80), -- e.g. "Coach Sam at Rovers"
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  check ((kind = 'clip') = (clip_id is not null))
);
create index share_links_player_idx on public.share_links (player_id, created_at desc);

create table public.share_link_views (
  id        bigint generated always as identity primary key,
  link_id   uuid not null references public.share_links (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

-- ---------- Helpers ----------

create function private.report_player(p_report uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.player_id from public.reports r join public.matches m on m.id = r.match_id where r.id = p_report
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('coach', 'admin'))
$$;

-- Ready to publish: four scores, at least one strength, every work-on has a drill.
create function private.report_problem(p_report uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select count(*) from public.report_scores where report_id = p_report) <> 4
      then 'Give all four scores before publishing.'
    when not exists (select 1 from public.report_items where report_id = p_report and kind = 'strength')
      then 'Add at least one strength before publishing.'
    when exists (select 1 from public.report_items where report_id = p_report and kind = 'workon'
                 and coalesce(trim(drill_title), '') = '')
      then 'Every work-on needs a drill before publishing.'
    else null
  end
$$;

-- Monday of this week in Sydney.
create function private.this_week_start() returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', (now() at time zone 'Australia/Sydney'))::date
$$;

-- ---------- Publishing now includes the report ----------

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
    -- (A report becomes required in Step 2, together with the screen for writing it.)
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

-- ---------- Focus ----------

create function public.set_focus(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  player uuid;
begin
  select private.report_player(i.report_id) into player
  from public.report_items i
  join public.reports r on r.id = i.report_id
  where i.id = p_item and i.kind = 'workon' and r.status = 'published';
  if player is null then
    raise exception 'That work-on isn''t available.' using errcode = '22023';
  end if;
  if not private.can_upload_for(player) then
    raise exception 'Only the player or their parent can set the focus.' using errcode = '42501';
  end if;
  insert into public.player_focus (player_id, week_start, report_item_id, set_by)
  values (player, private.this_week_start(), p_item, (select auth.uid()))
  on conflict (player_id, week_start)
  do update set report_item_id = excluded.report_item_id, set_by = excluded.set_by, created_at = now();
end;
$$;

-- ---------- Sharing ----------

create function public.create_share_link(p_match uuid, p_clip uuid, p_days int, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  player uuid := private.match_player(p_match);
  token text;
begin
  if player is null or not private.can_upload_for(player) then
    raise exception 'Only the player or their parent can share.' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (1, 7, 14) then
    raise exception 'Choose how long the link lasts: 1, 7 or 14 days.' using errcode = '22023';
  end if;
  if p_clip is null then
    if not exists (select 1 from public.reports where match_id = p_match and status = 'published') then
      raise exception 'Only a published report can be shared.' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.clips where id = p_clip and match_id = p_match and status = 'published') then
    raise exception 'Only a published clip can be shared.' using errcode = '22023';
  end if;

  token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.share_links (token_hash, player_id, match_id, kind, clip_id, note, created_by, expires_at)
  values (
    encode(extensions.digest(token, 'sha256'), 'hex'), player, p_match,
    case when p_clip is null then 'report' else 'clip' end, p_clip,
    nullif(left(trim(coalesce(p_note, '')), 80), ''), (select auth.uid()),
    now() + make_interval(days => p_days)
  );
  return token; -- shown once, in the link; never stored
end;
$$;

create function public.revoke_share_link(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.share_links;
begin
  select * into l from public.share_links where id = p_link;
  if l.id is null or not (private.is_guardian_of(l.player_id) or l.created_by = (select auth.uid())) then
    raise exception 'Only the person who shared it, or the player''s parent, can stop this link.' using errcode = '42501';
  end if;
  update public.share_links set revoked_at = coalesce(revoked_at, now()) where id = p_link;
end;
$$;

-- Server only: is this link valid right now? If so, record the view.
create function public.open_share_link(p_token text)
returns table (link_id uuid, kind text, match_id uuid, clip_id uuid, player_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare l public.share_links;
begin
  select * into l from public.share_links
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if l.id is null or l.revoked_at is not null or l.expires_at <= now() then return; end if;
  if private.is_minor(l.player_id) and not private.has_active_consent(l.player_id) then return; end if;
  if l.kind = 'report' and not exists (select 1 from public.reports r where r.match_id = l.match_id and r.status = 'published') then return; end if;
  if l.kind = 'clip' and not exists (select 1 from public.clips c where c.id = l.clip_id and c.status = 'published') then return; end if;
  insert into public.share_link_views (link_id) values (l.id);
  return query select l.id, l.kind, l.match_id, l.clip_id, l.player_id, l.expires_at;
end;
$$;

-- ---------- Permissions ----------

revoke all on public.score_categories, public.drills, public.reports, public.report_scores, public.report_items,
  public.player_focus, public.share_links, public.share_link_views from anon;
revoke insert, update, delete, truncate, references, trigger on public.score_categories, public.drills, public.reports,
  public.report_scores, public.report_items, public.player_focus, public.share_links, public.share_link_views
  from authenticated;

grant insert (name, sort_order), update (name, sort_order, is_active) on public.score_categories to authenticated;
grant insert (title, description), update (title, description, is_active) on public.drills to authenticated;
grant insert (match_id) on public.reports to authenticated;
grant delete on public.reports to authenticated;
grant insert (report_id, slot, category_id, category_name, score), update (category_id, category_name, score), delete
  on public.report_scores to authenticated;
grant insert (report_id, kind, body, sort_order, drill_id, drill_title, drill_description),
  update (body, sort_order, drill_id, drill_title, drill_description), delete
  on public.report_items to authenticated;

revoke execute on function public.set_focus(uuid) from public, anon;
revoke execute on function public.create_share_link(uuid, uuid, int, text) from public, anon;
revoke execute on function public.revoke_share_link(uuid) from public, anon;
revoke execute on function public.open_share_link(text) from public, anon, authenticated;
grant execute on function public.set_focus(uuid) to authenticated;
grant execute on function public.create_share_link(uuid, uuid, int, text) to authenticated;
grant execute on function public.revoke_share_link(uuid) to authenticated;
grant execute on function public.open_share_link(text) to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------- Row-level security ----------

alter table public.score_categories enable row level security;
alter table public.drills           enable row level security;
alter table public.reports          enable row level security;
alter table public.report_scores    enable row level security;
alter table public.report_items     enable row level security;
alter table public.player_focus     enable row level security;
alter table public.share_links      enable row level security;
alter table public.share_link_views enable row level security;

create policy "score_categories: logged-in users read" on public.score_categories
  for select to authenticated using (true);
create policy "score_categories: admin manages" on public.score_categories
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "drills: coaches and admins read" on public.drills
  for select to authenticated using (private.is_staff());
create policy "drills: coaches and admins add" on public.drills
  for insert to authenticated with check (private.is_staff());
create policy "drills: creator or admin edits" on public.drills
  for update to authenticated
  using (private.is_staff() and (created_by = (select auth.uid()) or private.is_admin()))
  with check (private.is_staff());

create policy "reports: coach sees all; player and parent see published" on public.reports
  for select to authenticated using (
    private.is_assigned_coach(private.match_player(match_id))
    or (status = 'published' and private.can_view_player(private.match_player(match_id)))
  );
create policy "reports: assigned coach starts one" on public.reports
  for insert to authenticated with check (private.is_assigned_coach(private.match_player(match_id)));
create policy "reports: assigned coach deletes a draft" on public.reports
  for delete to authenticated using (status = 'draft' and private.is_assigned_coach(private.match_player(match_id)));

create policy "report_scores: same as the report" on public.report_scores
  for select to authenticated using (exists (select 1 from public.reports r where r.id = report_id));
create policy "report_scores: assigned coach writes" on public.report_scores
  for all to authenticated
  using (private.is_assigned_coach(private.report_player(report_id)))
  with check (private.is_assigned_coach(private.report_player(report_id)));

create policy "report_items: same as the report" on public.report_items
  for select to authenticated using (exists (select 1 from public.reports r where r.id = report_id));
create policy "report_items: assigned coach writes" on public.report_items
  for all to authenticated
  using (private.is_assigned_coach(private.report_player(report_id)))
  with check (private.is_assigned_coach(private.report_player(report_id)));

create policy "player_focus: player, parent and coach can see" on public.player_focus
  for select to authenticated using (private.can_view_player(player_id));

create policy "share_links: the player and their parent can see" on public.share_links
  for select to authenticated using (private.is_guardian_of(player_id) or private.is_player_self(player_id));
create policy "share_link_views: the player and their parent can see" on public.share_link_views
  for select to authenticated using (exists (select 1 from public.share_links l where l.id = link_id));
