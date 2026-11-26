import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PitchDiagram } from "@/components/pitch-diagram";
import { Message, TextLink } from "@/components/ui";
import { formations, type TeamShape } from "@/config/formations";
import { formatMatchDate, matchStatusLabels } from "@/lib/matches";
import { createClient } from "@/lib/supabase/server";
import { ensureClipAssets } from "@/lib/video/clip-assets";
import { frameFor } from "@/lib/video/frames";
import { playbackForHalf } from "@/lib/video/playback";
import { PublishForm } from "./publish-form";
import { ReviewWorkspace, type SavedClip } from "./review-workspace";

export const metadata: Metadata = { title: "Review" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ published?: string }>;

async function Review({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // Only returns the match if you're allowed to see it (as its coach, here).
  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, player_id, match_date, opponent, team_shape, kit_colour, shirt_number, position, status, tap_half, tap_seconds, tap_x, tap_y",
    )
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();
  if (match.status === "uploading") redirect(`/matches/${id}`);

  if (match.status === "waiting_for_coach") {
    // Fails (and shows "not found") for anyone who isn't this player's coach.
    const { error } = await supabase.rpc("start_review", { p_match: id });
    if (error) notFound();
    match.status = "in_review";
  }
  if (match.status === "published") await ensureClipAssets(id);

  const [{ data: player }, { data: videos }, { data: tags }, { data: clips }] = await Promise.all([
    supabase.from("players").select("first_name").eq("id", match.player_id).maybeSingle(),
    supabase
      .from("match_videos")
      .select("id, half, duration_seconds")
      .eq("match_id", id)
      .eq("status", "ready")
      .order("half"),
    supabase.from("tags").select("id, name, is_active").order("sort_order"),
    supabase
      .from("clips")
      .select(
        "id, video_id, start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note, status, clip_tags(tag_id)",
      )
      .eq("match_id", id)
      .order("start_seconds"),
  ]);
  if (!videos?.length) return <Message kind="info">No uploaded video for this match.</Message>;

  const tapHalf = (match.tap_half ?? videos[0].half) as "first" | "second";
  const firstHalf = (videos.some((v) => v.half === tapHalf) ? tapHalf : videos[0].half) as "first" | "second";
  const [playback, tapFrame] = await Promise.all([
    playbackForHalf(supabase, id, firstHalf),
    match.tap_x !== null
      ? frameFor(supabase, id, match.tap_half as "first" | "second", Number(match.tap_seconds), 640)
      : Promise.resolve(null),
  ]);

  const saved: SavedClip[] = (clips ?? []).map((c) => ({
    id: c.id,
    videoId: c.video_id,
    start: Number(c.start_seconds),
    end: Number(c.end_seconds),
    ring:
      c.ring_x !== null
        ? { seconds: Number(c.start_seconds) + Number(c.ring_seconds ?? 0), x: Number(c.ring_x), y: Number(c.ring_y) }
        : null,
    strengthNote: c.strength_note ?? "",
    workonNote: c.workon_note ?? "",
    status: c.status,
    tagIds: ((c.clip_tags as { tag_id: string }[] | null) ?? []).map((t) => t.tag_id),
  }));
  const position = formations[match.team_shape as TeamShape]?.find((p) => p.code === match.position)?.label;
  const published = match.status === "published";
  const drafts = saved.filter((c) => c.status === "draft").length;

  return (
    <div className="space-y-6">
      {q.published && (
        <Message kind="success">Published. {player?.first_name} and their parent can now see the clips.</Message>
      )}
      <div>
        <p className="text-sm text-muted">Reviewing</p>
        <h1 className="text-2xl font-bold">
          {player?.first_name} · {formatMatchDate(match.match_date)}
          {match.opponent ? ` v ${match.opponent}` : ""}
        </h1>
        <p className="mt-1 text-sm text-lime">{matchStatusLabels[match.status]?.label}</p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-line bg-pitch-raised p-4 md:grid-cols-[1fr_auto]">
        <div>
          <h2 className="font-semibold">Find the player</h2>
          <p className="mt-1 text-sm text-muted">
            #{match.shirt_number} · {position ?? match.position} in {match.team_shape} · kit: {match.kit_colour}
          </p>
          {tapFrame && "url" in tapFrame && (
            <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl">
              {/* Private, short-lived image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tapFrame.url} alt="Where the player tapped themselves" className="h-full w-full object-cover" />
              <span
                aria-hidden
                className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-lime shadow-[0_0_0_2px_#0d1411]"
                style={{ left: `${Number(match.tap_x) * 100}%`, top: `${Number(match.tap_y) * 100}%` }}
              />
            </div>
          )}
        </div>
        <div className="w-28">
          <PitchDiagram shape={match.team_shape} position={match.position} shirtNumber={match.shirt_number} />
        </div>
      </section>

      <ReviewWorkspace
        matchId={id}
        halves={videos.map((v) => ({
          half: v.half as "first" | "second",
          videoId: v.id,
          duration: Number(v.duration_seconds ?? 0),
        }))}
        initialHalf={firstHalf}
        initialPlayback={playback}
        tags={tags ?? []}
        clips={saved}
        matchPublished={published}
      />

      {(!published || drafts > 0) && (
        <PublishForm
          matchId={id}
          clipCount={drafts}
          playerName={player?.first_name ?? "the player"}
          republish={published}
        />
      )}

      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}

export default function ReviewPage(props: { params: Params; searchParams: Search }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Review params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
