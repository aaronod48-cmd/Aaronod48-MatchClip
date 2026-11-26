import { ClipPlayer } from "@/components/clip-player";
import { halfLabels } from "@/lib/matches";
import type { createClient } from "@/lib/supabase/server";
import { ensureClipAssets } from "@/lib/video/clip-assets";
import { playbackForClip } from "@/lib/video/playback";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The published clips for a match, as the player and their parent see them.
 * The database only returns PUBLISHED clips and COACH-CONFIRMED tags to them.
 */
export async function YourClips({
  supabase,
  matchId,
  firstName,
}: {
  supabase: Supabase;
  matchId: string;
  firstName: string;
}) {
  await ensureClipAssets(matchId); // pick up any clip videos that have just finished being cut

  const { data: clips } = await supabase
    .from("clips")
    .select(
      "id, start_seconds, end_seconds, ring_seconds, ring_x, ring_y, strength_note, workon_note, provider_playback_id, match_videos(half), clip_tags(confirmed_by, tags(name, sort_order))",
    )
    .eq("match_id", matchId)
    .eq("status", "published")
    .order("start_seconds");

  const sorted = (clips ?? []).sort((a, b) => {
    const ha = (a.match_videos as unknown as { half: string } | null)?.half === "second" ? 1 : 0;
    const hb = (b.match_videos as unknown as { half: string } | null)?.half === "second" ? 1 : 0;
    return ha - hb || Number(a.start_seconds) - Number(b.start_seconds);
  });
  const playbacks = await Promise.all(
    sorted.map((c) =>
      playbackForClip(supabase, matchId, {
        id: c.id,
        provider_playback_id: c.provider_playback_id,
        start_seconds: Number(c.start_seconds),
        end_seconds: Number(c.end_seconds),
      }),
    ),
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        {firstName}&apos;s clips ({sorted.length})
      </h2>
      {sorted.length === 0 && <p className="text-sm text-muted">No clips yet.</p>}
      <ol className="space-y-6">
        {sorted.map((c, i) => {
          const half = (c.match_videos as unknown as { half: "first" | "second" } | null)?.half;
          const tags = (
            (c.clip_tags as unknown as {
              confirmed_by: string | null;
              tags: { name: string; sort_order: number } | null;
            }[]) ?? []
          )
            .filter((t) => t.confirmed_by && t.tags) // coach-confirmed only (the database already ensures this)
            .map((t) => t.tags!)
            .sort((a, b) => a.sort_order - b.sort_order);
          const label = `Clip ${i + 1}`;
          return (
            <li key={c.id} className="space-y-3 rounded-2xl border border-line bg-pitch-raised p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{label}</span>
                <span className="text-muted">
                  {half ? `${halfLabels[half]} · ` : ""}
                  {clock(Number(c.start_seconds))}
                </span>
              </div>
              <ClipPlayer
                playback={playbacks[i]}
                length={Number(c.end_seconds) - Number(c.start_seconds)}
                label={label}
                ring={
                  c.ring_x !== null
                    ? { seconds: Number(c.ring_seconds ?? 0), x: Number(c.ring_x), y: Number(c.ring_y) }
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
              {c.strength_note && (
                <div className="rounded-xl border-l-4 border-lime bg-pitch px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-lime">Strength</p>
                  <p className="mt-0.5">{c.strength_note}</p>
                </div>
              )}
              {c.workon_note && (
                <div className="rounded-xl border-l-4 border-workon bg-pitch px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-workon">Work-on</p>
                  <p className="mt-0.5">{c.workon_note}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
