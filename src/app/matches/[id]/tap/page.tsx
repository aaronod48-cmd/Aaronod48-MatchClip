import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PitchDiagram } from "@/components/pitch-diagram";
import { AuthShell, Message, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { syncMatchVideos } from "@/lib/video/sync";
import { TapYourself } from "./tap-yourself";

export const metadata: Metadata = { title: "Tap yourself" };

type Params = Promise<{ id: string }>;

async function Tap({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, team_shape, position, shirt_number, tap_half, tap_seconds, tap_x, tap_y")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();
  if (match.status !== "uploading") redirect(`/matches/${id}`);

  await syncMatchVideos(id);
  const { data: videos } = await supabase
    .from("match_videos")
    .select("half, status, duration_seconds")
    .eq("match_id", id)
    .eq("status", "ready")
    .order("half");
  const halves = (videos ?? []).map((v) => ({
    half: v.half as "first" | "second",
    durationSeconds: Number(v.duration_seconds ?? 0),
  }));

  if (!halves.length) {
    return (
      <div className="space-y-4">
        <Message kind="info">Your video is still being prepared. Try again in a minute or two.</Message>
        <TextLink href={`/matches/${id}`}>Back to the match</TextLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-pitch-raised p-4">
        <div className="w-24 shrink-0">
          <PitchDiagram shape={match.team_shape} position={match.position} shirtNumber={match.shirt_number} />
        </div>
        <p className="text-sm text-muted">
          The coach will look for <strong className="text-chalk">#{match.shirt_number}</strong> in {match.team_shape}.
          Your tap shows them exactly which player is you.
        </p>
      </div>
      <TapYourself
        matchId={id}
        halves={halves}
        initial={
          match.tap_half && match.tap_x !== null
            ? {
                half: match.tap_half as "first" | "second",
                seconds: Number(match.tap_seconds),
                x: Number(match.tap_x),
                y: Number(match.tap_y),
              }
            : null
        }
      />
      <p className="text-center text-sm">
        <TextLink href={`/matches/${id}`}>Cancel</TextLink>
      </p>
    </div>
  );
}

export default function TapPage(props: { params: Params }) {
  return (
    <AuthShell title="Tap yourself">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Tap params={props.params} />
      </Suspense>
    </AuthShell>
  );
}
