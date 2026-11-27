import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ClipPlayer } from "@/components/clip-player";
import { ReportView, type ReportData } from "@/components/report-view";
import { brand } from "@/config/brand";
import { formatMatchDate } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClipPlayback } from "@/lib/video/playback";
import { isFakeVideoAllowed } from "@/lib/video/provider";
import { signMuxToken, signingKeyMissing } from "@/lib/video/signing";

// Never pass this page's address (with its secret) on to other websites, and keep it out of search engines.
export const metadata: Metadata = {
  title: "Shared with you",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

type Params = Promise<{ token: string }>;

function Gone() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">This link no longer works</h1>
      <p className="text-muted">
        It may have expired or been stopped. Ask the player or their parent to share it again if you still need it.
      </p>
    </div>
  );
}

/** A short-lived private video link: 1 hour, never beyond the share link's own expiry. */
function sharedClipPlayback(playbackId: string | null, linkExpiresAt: string): ClipPlayback {
  if (!playbackId) return { kind: "preparing" };
  if (isFakeVideoAllowed()) return { kind: "fake" };
  if (signingKeyMissing()) return { kind: "error", message: "Video isn't available right now." };
  const ttl = Math.max(60, Math.min(3600, Math.floor((new Date(linkExpiresAt).getTime() - Date.now()) / 1000)));
  return {
    kind: "mux",
    playbackId,
    tokens: {
      playback: signMuxToken(playbackId, "v", ttl),
      thumbnail: signMuxToken(playbackId, "t", ttl),
      storyboard: signMuxToken(playbackId, "s", ttl),
    },
  };
}

/**
 * A shared report or clip, for someone without an account (e.g. the player's
 * club coach). The server checks the link (not expired or stopped, still
 * published, consent active) and records the view; then it shows ONLY what
 * was shared.
 */
async function Shared({ params }: { params: Params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return <Gone />;
  const admin = createAdminClient();
  if (!admin) return <Gone />;

  const { data: rows } = await admin.rpc("open_share_link", { p_token: token });
  const link = (rows as { kind: string; match_id: string; clip_id: string | null; expires_at: string }[] | null)?.[0];
  if (!link) return <Gone />;

  const { data: match } = await admin
    .from("matches")
    .select("match_date, opponent, players(first_name)")
    .eq("id", link.match_id)
    .single();
  const firstName = (match?.players as unknown as { first_name: string } | null)?.first_name ?? "A player";
  const title = `${firstName} · ${match ? formatMatchDate(match.match_date) : ""}${match?.opponent ? ` v ${match.opponent}` : ""}`;
  const until = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(link.expires_at));

  let body: React.ReactNode = <Gone />;

  if (link.kind === "report") {
    const { data: report } = await admin
      .from("reports")
      .select(
        "report_scores(slot, category_name, score), report_items(id, kind, body, sort_order, drill_title, drill_description)",
      )
      .eq("match_id", link.match_id)
      .eq("status", "published")
      .single();
    if (report) {
      const data: ReportData = {
        scores: (report.report_scores as ReportData["scores"]) ?? [],
        items: (report.report_items as ReportData["items"]) ?? [],
      };
      body = <ReportView data={data} />;
    }
  } else if (link.clip_id) {
    const { data: clip } = await admin
      .from("clips")
      .select(
        "start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note, provider_playback_id, clip_tags(confirmed_by, tags(name, sort_order))",
      )
      .eq("id", link.clip_id)
      .eq("status", "published")
      .single();
    if (clip) {
      const length = Number(clip.end_seconds) - Number(clip.start_seconds);
      const playback = sharedClipPlayback(clip.provider_playback_id, link.expires_at);
      const tags = (
        (clip.clip_tags as unknown as {
          confirmed_by: string | null;
          tags: { name: string; sort_order: number } | null;
        }[]) ?? []
      )
        .filter((t) => t.confirmed_by && t.tags)
        .map((t) => t.tags!)
        .sort((a, b) => a.sort_order - b.sort_order);
      body = (
        <section className="space-y-3 rounded-2xl border border-line bg-pitch-raised p-4">
          <ClipPlayer
            playback={playback}
            length={length}
            label="Shared clip"
            ring={
              clip.ring_x !== null
                ? { seconds: Number(clip.ring_seconds ?? 0), x: Number(clip.ring_x), y: Number(clip.ring_y) }
                : null
            }
          />
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {tags.map((t) => (
                <li key={t.name} className="rounded-full border border-line px-2.5 py-0.5 text-xs">
                  {t.name}
                </li>
              ))}
            </ul>
          )}
          {clip.strength_note && (
            <div className="rounded-xl border-l-4 border-lime bg-pitch px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-lime">Strength</p>
              <p className="mt-0.5">{clip.strength_note}</p>
            </div>
          )}
          {clip.workon_note && (
            <div className="rounded-xl border-l-4 border-workon bg-pitch px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-workon">Work-on</p>
              <p className="mt-0.5">{clip.workon_note}</p>
            </div>
          )}
        </section>
      );
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Shared with you privately</p>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-xs text-muted">This link works until {until}. Please don&apos;t pass it on.</p>
      </div>
      {body}
    </div>
  );
}

export default function SharedPage(props: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Image src={brand.logo} alt="" width={32} height={32} priority />
        <span className="text-lg font-bold tracking-tight">{brand.name}</span>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Shared params={props.params} />
      </Suspense>
    </main>
  );
}
