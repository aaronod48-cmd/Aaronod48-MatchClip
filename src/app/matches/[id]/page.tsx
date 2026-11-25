import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell, TextLink } from "@/components/ui";
import { formations, type TeamShape } from "@/config/formations";
import { formatMatchDate, halfLabels, matchStatusLabels } from "@/lib/matches";
import { createClient } from "@/lib/supabase/server";
import { syncMatchVideos } from "@/lib/video/sync";
import { DeleteMatchForm } from "./delete-match-form";
import { HalfUploader } from "./half-uploader";

export const metadata: Metadata = { title: "Match" };

type Params = Promise<{ id: string }>;

const toneClass = { muted: "text-muted", lime: "text-lime", workon: "text-workon" };

async function Match({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // The database only returns this match if you're allowed to see it.
  const { data: match } = await supabase
    .from("matches")
    .select("id, player_id, match_date, opponent, team_shape, kit_colour, shirt_number, position, status")
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{player?.first_name}</p>
        <h1 className="text-2xl font-bold">
          {formatMatchDate(match.match_date)}
          {match.opponent ? ` v ${match.opponent}` : ""}
        </h1>
        <p className={`mt-1 text-sm font-medium ${toneClass[status.tone]}`}>{status.label}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
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

      {(["first", "second"] as const).map((half) => {
        const v = videos?.find((x) => x.half === half);
        const done = v?.status === "processing" || v?.status === "ready";
        return (
          <section key={half} className="rounded-2xl border border-line bg-pitch-raised p-4">
            <h2 className="font-semibold">{halfLabels[half]}</h2>
            {v?.status === "ready" && (
              <p className="mt-2 text-sm text-lime">
                Uploaded ✓{v.duration_seconds ? ` · ${Math.round(Number(v.duration_seconds) / 60)} min` : ""}
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

      {canUpload && (
        <section className="rounded-2xl border border-dashed border-line p-4 text-sm">
          <h2 className="font-semibold">Next: tap yourself</h2>
          <p className="mt-1 text-muted">
            {anyUploaded
              ? "Coming in the next step: you'll tap yourself on a frame, then send the match to the coach."
              : "Upload at least one half first."}
          </p>
        </section>
      )}

      <DeleteMatchForm matchId={match.id} />

      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}

export default function MatchPage(props: { params: Params }) {
  return (
    <AuthShell title="">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Match params={props.params} />
      </Suspense>
    </AuthShell>
  );
}
