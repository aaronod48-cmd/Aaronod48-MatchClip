import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoProvider } from "@/lib/video/provider";

/**
 * Works through the "files to delete" list: tells the video service to delete
 * each video/clip, then ticks it off. Anything that fails stays on the list
 * and is retried later (immediately next time, and by the daily job).
 */
export async function processDeletions(limit = 50): Promise<{ done: number; failed: number }> {
  const admin = createAdminClient();
  const provider = getVideoProvider();
  if (!admin || !provider) return { done: 0, failed: 0 };

  const { data: items } = await admin.rpc("next_provider_deletions", { p_limit: limit });
  let done = 0;
  let failed = 0;
  for (const item of (items ?? []) as {
    id: number;
    provider: string;
    asset_id: string | null;
    upload_id: string | null;
  }[]) {
    try {
      // Pretend files from automatic tests (or a different service) need nothing deleted here.
      if (item.provider === provider.name || item.provider === "mux") {
        if (item.asset_id) await provider.deleteAsset(item.asset_id);
        else if (item.upload_id) await provider.cancelUpload(item.upload_id);
      }
      await admin.rpc("finish_provider_deletion", { p_id: item.id, p_error: null });
      done++;
    } catch (e) {
      await admin.rpc("finish_provider_deletion", { p_id: item.id, p_error: String(e) });
      failed++;
    }
  }
  return { done, failed };
}

/** Best effort: never let a hiccup at the video service break the page the person is on. */
export async function processDeletionsQuietly() {
  try {
    await processDeletions();
  } catch (e) {
    console.error("Deleting files at the video service failed; the daily job will retry", e);
  }
}

/** The 60-day rule: remove full match videos (clips are kept), then delete their files. */
export async function expireOldVideos(): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data } = await admin.rpc("expire_full_videos");
  return Number(data ?? 0);
}
