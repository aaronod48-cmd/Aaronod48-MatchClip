"use server";

import { redirect } from "next/navigation";
import { processDeletionsQuietly } from "@/lib/video/deletions";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video/provider";
import { syncMatchVideos } from "@/lib/video/sync";

export type FormState = { error?: string } | undefined;

function dbMessage(error: { code?: string; message: string } | null): string {
  if (error && (error.code === "22023" || error.code === "42501")) return error.message;
  return "Something went wrong. Please try again.";
}

/** Adult players: create your own player profile the first time you upload. */
export async function createMyPlayerProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_my_player_profile", {
    p_birth_year: Number(form.get("birthYear")),
    p_team_name: String(form.get("teamName") ?? ""),
  });
  if (error) return { error: dbMessage(error) };
  redirect("/matches/new");
}

export async function createMatchAction(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: matchId, error } = await supabase.rpc("create_match", {
    p_player: String(form.get("playerId") ?? ""),
    p_match_date: String(form.get("matchDate") ?? ""),
    p_opponent: String(form.get("opponent") ?? ""),
    p_team_shape: String(form.get("teamShape") ?? ""),
    p_kit_colour: String(form.get("kitColour") ?? ""),
    p_shirt_number: Number(form.get("shirtNumber")),
    p_position: String(form.get("position") ?? ""),
  });
  if (error || !matchId) return { error: dbMessage(error) };
  redirect(`/matches/${matchId}`);
}

/**
 * Get a one-time address for uploading one half straight to the video service.
 * The database first checks (as the logged-in person) that they may upload.
 */
export async function startHalfUploadAction(
  matchId: string,
  half: "first" | "second",
): Promise<{ url?: string; videoId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: videoId, error } = await supabase.rpc("prepare_video_upload", { p_match: matchId, p_half: half });
  if (error || !videoId) return { error: dbMessage(error) };

  await processDeletionsQuietly(); // a retried half's old attempt is deleted at the video service
  const provider = getVideoProvider();
  const admin = createAdminClient();
  if (!provider || !admin) {
    // Names only the missing setting (never a value), so the owner can fix it in Vercel.
    const missing = [!provider && "MUX_TOKEN_ID / MUX_TOKEN_SECRET", !admin && "SUPABASE_SECRET_KEY"].filter(Boolean);
    console.error("Video upload settings missing:", missing.join(", "));
    return { error: `Video uploads aren't set up yet. Missing setting: ${missing.join(" and ")}.` };
  }

  try {
    const { uploadId, url } = await provider.createUpload({ corsOrigin: await siteOrigin(), passthrough: videoId });
    const { error: saveError } = await admin
      .from("match_videos")
      .update({ provider: provider.name, provider_upload_id: uploadId, status: "waiting_upload" })
      .eq("id", videoId);
    if (saveError) throw saveError;
    return { url, videoId };
  } catch (e) {
    console.error("startHalfUpload failed", e);
    return { error: "Couldn't start the upload. Please try again." };
  }
}

/** Called by the phone when the last piece has been sent. */
export async function halfUploadedAction(videoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  // Only returns the video if this person may see it.
  const { data: video } = await supabase.from("match_videos").select("id, match_id").eq("id", videoId).maybeSingle();
  if (!video) return { error: "Not allowed." };
  await syncMatchVideos(video.match_id);
  return {};
}

export async function deleteMatchAction(_prev: FormState, form: FormData): Promise<FormState> {
  const matchId = String(form.get("matchId") ?? "");
  if (form.get("confirmDelete") !== "yes") return { error: "Please tick the box to confirm." };
  const supabase = await createClient();
  // The database only lets the parent (or an adult player) delete. Video files are
  // queued for deletion at the video service automatically.
  const { data, error } = await supabase.from("matches").delete().eq("id", matchId).select("id");
  if (error || !data?.length) return { error: "Couldn't delete this match." };
  await processDeletionsQuietly(); // delete the files at the video service now
  redirect("/dashboard?matchDeleted=1");
}
