import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { PitchDiagram } from "@/components/pitch-diagram";
import { AuthShell, Message, TextLink } from "@/components/ui";
import { formations, type TeamShape } from "@/config/formations";
import { formatMatchDate, halfLabels, matchStatusLabels } from "@/lib/matches";
import { createClient } from "@/lib/supabase/server";
import { frameFor } from "@/lib/video/frames";
import { syncMatchVideos } from "@/lib/video/sync";
import { DeleteMatchForm } from "./delete-match-form";
import { HalfUploader } from "./half-uploader";
import { SendToCoach } from "./send-to-coach";
import { YourClips } from "./your-clips";

export const metadata: Metadata = { title: "Match" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ tapped?: string; sent?: string }>;

const toneClass = { muted: "text-muted", lime: "text-lime", workon: "text-workon" };

async function Match({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // The database only returns this match if you're allowed to see it.
  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, player_id, match_date, opponent, team_shape, kit_colour, shirt_number, position, status, tap_half, tap_seconds, tap_x, tap_y",
    )
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();

  await syncMatchVideos(match.id); // pick up "upload finished" / "ready" from the video service

  const [{ data: videos }, { data: player }] = await Promise.all([
    supabase.from("match_videos").select("half, status, duration_seconds").eq("match_id", id).order("half"),
    supabase.from("players").select("first_name").eq("id", match.player_id).maybeSingle(),
  ]);
  const position = formations[match.team_shape as TeamShape]?.find((p) => p.code === match.position)?.label;
  const status = matchStatusLabels[match.status] ?? { label: match.status, tone: "muted" as const };
  const canUpload = match.status === "uploading";
  const anyUploaded = (videos ?? []).some((v) => v.status === "processing" || v.status === "ready");
  const anyReady = (videos ?? []).some((v) => v.status === "ready");
  const hasTap = match.tap_half !== null && match.tap_x !== null;
  // The saved tap, shown on its frame (a private, short-lived image).
  const tapFrame = hasTap
    ? await frameFor(supabase, match.id, match.tap_half as "first" | "second", Number(match.tap_seconds), 640)
    : null;

  return (
    <div className="space-y-6">
      {q.tapped && canUpload && <Message kind="success">Tap saved. Now send the match to your coach.</Message>}
      {q.sent && (
        <Message kind="success">Sent to the coach. You&apos;ll see your clips here once they&apos;re ready.</Message>
      )}

      <div>
        <p className="text-sm text-muted">{player?.first_name}</p>
        <h1 className="text-2xl font-bold">
          {formatMatchDate(match.match_date)}
          {match.opponent ? ` v ${match.opponent}` : ""}
        </h1>
        <p className={`mt-1 text-sm font-medium ${toneClass[status.tone]}`}>{status.label}</p>
      </div>

      {match.status === "published" && (
        <YourClips supabase={supabase} matchId={match.id} firstName={player?.first_name ?? "Your"} />
      )}

      <div className="flex gap-4 rounded-2xl border border-line bg-pitch-raised p-4">
        <div className="w-24 shrink-0">
          <PitchDiagram shape={match.team_shape} position={match.position} shirtNumber={match.shirt_number} />
        </div>
        <dl className="grid flex-1 grid-cols-2 content-start gap-3 text-sm">
          <div>
            <dt className="text-muted">Shape</dt>
            <dd className="font-medium">{match.team_shape}</dd>
          </div>
          <div>
            <dt className="text-muted">Position</dt>
            <dd className="font-medium">{position ?? match.position}</dd>
          </div>
          <div>
            <dt className="text-muted">Shirt</dt>
            <dd className="font-medium">#{match.shirt_number}</dd>
          </div>
          <div>
            <dt className="text-muted">Kit</dt>
            <dd className="font-medium break-words">{match.kit_colour}</dd>
          </div>
        </dl>
      </div>

      {(["first", "second"] as const).map((half) => {
        const v = videos?.find((x) => x.half === half);
        const done = v?.status === "processing" || v?.status === "ready";
        return (
          <section key={half} className="rounded-2xl border border-line bg-pitch-raised p-4">
            <h2 className="font-semibold">{halfLabels[half]}</h2>
            {v?.status === "ready" && (
              <p className="mt-2 text-sm text-lime">
                Uploaded ✓
                {v.duration_seconds
                  ? Number(v.duration_seconds) < 60
                    ? " · under 1 min"
                    : ` · ${Math.round(Number(v.duration_seconds) / 60)} min`
                  : ""}
              </p>
            )}
            {v?.status === "processing" && (
              <p className="mt-2 text-sm text-muted">Uploaded ✓ · being prepared (this can take a few minutes)</p>
            )}
            {!done && canUpload && <HalfUploader matchId={match.id} half={half} failed={v?.status === "errored"} />}
            {!done && !canUpload && <p className="mt-2 text-sm text-muted">Not uploaded.</p>}
          </section>
        );
      })}

      <section className="rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
        <h2 className="font-semibold">Tap yourself</h2>
        {hasTap && tapFrame && "url" in tapFrame && (
          <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl">
            {/* Private, short-lived image from the video service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tapFrame.url} alt="The frame where you tapped yourself" className="h-full w-full object-cover" />
            <span
              aria-hidden
              className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-lime shadow-[0_0_0_2px_#0d1411]"
              style={{ left: `${Number(match.tap_x) * 100}%`, top: `${Number(match.tap_y) * 100}%` }}
            />
          </div>
        )}
        {hasTap && tapFrame && "error" in tapFrame && <p className="mt-2 text-workon">{tapFrame.error}</p>}
        {hasTap && <p className="mt-2 text-lime">Tap saved ✓</p>}
        {canUpload && !hasTap && anyReady && (
          <Link
            href={`/matches/${match.id}/tap`}
            className="mt-3 block w-full rounded-xl bg-lime px-4 py-3 text-center font-semibold text-pitch"
          >
            Tap yourself
          </Link>
        )}
        {canUpload && hasTap && (
          <Link href={`/matches/${match.id}/tap`} className="mt-1 inline-block text-muted underline">
            Change
          </Link>
        )}
        {canUpload && !anyReady && (
          <p className="mt-1 text-muted">
            {anyUploaded ? "Your video is being prepared. Refresh in a minute." : "Upload at least one half first."}
          </p>
        )}
      </section>

      {canUpload && hasTap && anyUploaded && <SendToCoach matchId={match.id} />}

      <DeleteMatchForm matchId={match.id} />

      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}

export default function MatchPage(props: { params: Params; searchParams: Search }) {
  return (
    <AuthShell title="">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Match params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
