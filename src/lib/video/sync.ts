import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoProvider } from "@/lib/video/provider";

/**
 * Bring the match's videos up to date with the video service: upload
 * finished -> processing -> ready. A half longer than the limit is removed.
 * Only call after checking (as the logged-in person) that they can see the match.
 */
export async function syncMatchVideos(matchId: string): Promise<void> {
  const provider = getVideoProvider();
  const admin = createAdminClient();
  if (!provider || !admin) return;
  const { data: videos } = await admin
    .from("match_videos")
    .select("id, status, provider_upload_id, provider_asset_id")
    .eq("match_id", matchId)
    .in("status", ["waiting_upload", "processing"]);

  for (const v of videos ?? []) {
    try {
      let assetId = v.provider_asset_id as string | null;
      if (!assetId && v.provider_upload_id) {
        const upload = await provider.getUpload(v.provider_upload_id);
        if (upload.state === "asset_created") {
          assetId = upload.assetId;
          await admin.from("match_videos").update({ provider_asset_id: assetId, status: "processing" }).eq("id", v.id);
        } else if (upload.state === "failed") {
          await admin.from("match_videos").update({ status: "errored" }).eq("id", v.id);
        }
      }
      if (!assetId) continue;

      const asset = await provider.getAsset(assetId);
      if (asset.state === "ready") {
        if (asset.durationSeconds > 60 * 60) {
          await provider.deleteAsset(assetId);
          await admin
            .from("match_videos")
            .update({ status: "errored", provider_asset_id: null, provider_playback_id: null, duration_seconds: null })
            .eq("id", v.id);
        } else {
          await admin
            .from("match_videos")
            .update({
              status: "ready",
              provider_playback_id: asset.playbackId,
              duration_seconds: asset.durationSeconds,
            })
            .eq("id", v.id);
        }
      } else if (asset.state === "failed") {
        await admin.from("match_videos").update({ status: "errored" }).eq("id", v.id);
      }
    } catch {
      // Video service unreachable: try again next time the page loads.
    }
  }
}
