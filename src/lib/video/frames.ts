import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isFakeVideoAllowed } from "@/lib/video/provider";
import { signedThumbnailUrl, signingKeyMissing } from "@/lib/video/signing";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FrameResult = { url: string } | { error: string };

/**
 * A private still frame from one half of a match.
 * The database first checks (as the logged-in person) that they may see this
 * player, and logs it if it's staff opening a minor's video.
 */
export async function frameFor(
  supabase: Supabase,
  matchId: string,
  half: "first" | "second",
  seconds: number,
  width = 960,
): Promise<FrameResult> {
  const { data: video } = await supabase
    .from("match_videos")
    .select("id, status, provider_playback_id, duration_seconds")
    .eq("match_id", matchId)
    .eq("half", half)
    .maybeSingle();
  if (!video || video.status !== "ready" || !video.provider_playback_id) {
    return { error: "This half isn't ready yet." };
  }
  const { error } = await supabase.rpc("record_media_view", {
    p_match: matchId,
    p_kind: "view_video",
    p_target: video.id,
  });
  if (error) return { error: "Not allowed." };

  const t = Math.min(Math.max(0, seconds), Math.max(0, Number(video.duration_seconds ?? 0) - 0.5));
  if (isFakeVideoAllowed()) return { url: `/api/fake-thumbnail?t=${t}` };
  if (signingKeyMissing()) {
    return { error: "Video frames aren't set up yet. Missing setting: MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY." };
  }
  return { url: signedThumbnailUrl(video.provider_playback_id, t, width) };
}
