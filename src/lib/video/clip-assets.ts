import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoProvider } from "@/lib/video/provider";

/**
 * Make each published clip its own short private video at the video service
 * (so it lasts after the full match video is deleted), and pick up its
 * playback id once ready. Safe to call repeatedly; failures retry next time.
 * Only call after checking (as the logged-in person) they may see the match.
 */
export async function ensureClipAssets(matchId: string): Promise<void> {
  const provider = getVideoProvider();
  const admin = createAdminClient();
  if (!provider || !admin) return;

  const { data: clips } = await admin
    .from("clips")
    .select("id, start_seconds, end_seconds, provider_asset_id, provider_playback_id, match_videos(provider_asset_id)")
    .eq("match_id", matchId)
    .eq("status", "published")
    .is("provider_playback_id", null);

  for (const c of clips ?? []) {
    try {
      let assetId = c.provider_asset_id as string | null;
      const source = (c.match_videos as unknown as { provider_asset_id: string | null } | null)?.provider_asset_id;
      if (!assetId && source) {
        assetId = await provider.createClipAsset({
          sourceAssetId: source,
          start: Number(c.start_seconds),
          end: Number(c.end_seconds),
          passthrough: c.id,
        });
        await admin.from("clips").update({ provider_asset_id: assetId }).eq("id", c.id);
      }
      if (!assetId) continue;
      const asset = await provider.getAsset(assetId);
      if (asset.state === "ready") {
        await admin.from("clips").update({ provider_playback_id: asset.playbackId }).eq("id", c.id);
      }
    } catch (e) {
      console.error("Clip video not created yet; will retry", c.id, e);
    }
  }
}
