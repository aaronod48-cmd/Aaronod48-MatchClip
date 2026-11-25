import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isFakeVideoAllowed } from "@/lib/video/provider";
import { signMuxToken, signingKeyMissing } from "@/lib/video/signing";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Playback =
  | {
      kind: "mux";
      playbackId: string;
      tokens: { playback: string; thumbnail: string; storyboard: string };
      duration: number;
    }
  | { kind: "fake"; duration: number }
  | { kind: "error"; message: string };

/**
 * A private, short-lived way to play one half of a match.
 * The database first checks (as the logged-in person) that they may see this
 * player, and logs it if it's staff opening a minor's video.
 */
export async function playbackForHalf(
  supabase: Supabase,
  matchId: string,
  half: "first" | "second",
): Promise<Playback> {
  const { data: video } = await supabase
    .from("match_videos")
    .select("id, status, provider_playback_id, duration_seconds")
    .eq("match_id", matchId)
    .eq("half", half)
    .maybeSingle();
  if (!video || video.status !== "ready" || !video.provider_playback_id) {
    return { kind: "error", message: "This half isn't ready." };
  }
  const { error } = await supabase.rpc("record_media_view", {
    p_match: matchId,
    p_kind: "view_video",
    p_target: video.id,
  });
  if (error) return { kind: "error", message: "Not allowed." };

  const duration = Number(video.duration_seconds ?? 0);
  if (isFakeVideoAllowed()) return { kind: "fake", duration };
  if (signingKeyMissing())
    return { kind: "error", message: "Missing setting: MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY." };

  // Long enough to watch the whole half once, then the link stops working.
  const ttl = Math.ceil(duration) + 2 * 60 * 60;
  const id = video.provider_playback_id;
  return {
    kind: "mux",
    playbackId: id,
    duration,
    tokens: {
      playback: signMuxToken(id, "v", ttl),
      thumbnail: signMuxToken(id, "t", ttl),
      storyboard: signMuxToken(id, "s", ttl),
    },
  };
}
