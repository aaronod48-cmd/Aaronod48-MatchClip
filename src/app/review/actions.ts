"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureClipAssets } from "@/lib/video/clip-assets";
import { playbackForHalf } from "@/lib/video/playback";

function dbMessage(error: { code?: string; message: string } | null): string {
  // Our own database checks give plain-English messages; technical ones are replaced.
  const technical = /permission denied|row-level security|violates/i.test(error?.message ?? "");
  if (error && (error.code === "22023" || error.code === "42501") && !technical) return error.message;
  if (technical) return "You don't have permission to do that.";
  if (error?.code === "23514") return "Please check the clip times (2 to 60 seconds) and the ring.";
  return "Something went wrong. Please try again.";
}

/** Admin: make yourself the default coach (every player without a coach is assigned to you). */
export async function makeMeDefaultCoachAction(): Promise<void> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");
  // The database only lets an admin change this.
  const { error } = await supabase.from("app_settings").update({ default_coach_id: me }).eq("id", true);
  redirect(error ? "/dashboard?error=defaultCoach" : "/dashboard?defaultCoach=1");
}

export type ClipInput = {
  matchId: string;
  clipId?: string;
  videoId: string;
  start: number;
  end: number;
  ring: { seconds: number; x: number; y: number } | null;
  strengthNote: string;
  workonNote: string;
  tagIds: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Save (create or update) a draft clip with its ring, notes and tags. The database checks it's this player's coach. */
export async function saveClipAction(input: ClipInput): Promise<{ error?: string; clipId?: string }> {
  const strength = input.strengthNote.trim();
  const workon = input.workonNote.trim();
  if (!strength) return { error: "Please write a strength note." };
  if (strength.length > 500 || workon.length > 500) return { error: "Notes can be up to 500 characters." };
  const length = input.end - input.start;
  if (!(length >= 2 && length <= 60)) return { error: "A clip must be between 2 and 60 seconds." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");

  const fields = {
    start_seconds: round2(input.start),
    end_seconds: round2(input.end),
    ring_seconds: input.ring ? round2(Math.min(Math.max(0, input.ring.seconds - input.start), length)) : null,
    ring_x: input.ring ? round4(input.ring.x) : null,
    ring_y: input.ring ? round4(input.ring.y) : null,
    strength_note: strength,
    workon_note: workon || null,
  };

  let clipId = input.clipId;
  if (clipId) {
    const { data, error } = await supabase.from("clips").update(fields).eq("id", clipId).select("id");
    if (error || !data?.length) return { error: dbMessage(error) };
  } else {
    const { data, error } = await supabase
      .from("clips")
      .insert({ match_id: input.matchId, video_id: input.videoId, ...fields })
      .select("id")
      .single();
    if (error || !data) return { error: dbMessage(error) };
    clipId = data.id;
  }

  // Tags: replace this clip's tags with the coach's choice (all coach-confirmed).
  await supabase.from("clip_tags").delete().eq("clip_id", clipId);
  if (input.tagIds.length) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("clip_tags")
      .insert(
        input.tagIds.slice(0, 10).map((tag_id) => ({ clip_id: clipId, tag_id, confirmed_by: me, confirmed_at: now })),
      );
    if (error) return { error: dbMessage(error), clipId };
  }
  return { clipId };
}

export async function deleteClipAction(clipId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clips").delete().eq("id", clipId).select("id");
  return error || !data?.length ? { error: "Couldn't delete this clip." } : {};
}

export type PublishState = { error?: string } | undefined;

/** Publish: clips become visible to the player and parent; each clip is cut as its own short video. */
export async function publishAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const matchId = String(form.get("matchId") ?? "");
  if (form.get("confirmPublish") !== "yes") return { error: "Please tick the box to confirm." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_match", { p_match: matchId });
  if (error) return { error: dbMessage(error) };
  await ensureClipAssets(matchId);
  revalidatePath(`/review/${matchId}`);
  // A fresh address every time, so the screen always refreshes (even after publishing again).
  redirect(`/review/${matchId}?published=${Date.now()}`);
}

/** Switch the review player to another half (a fresh private link; logged for minors). */
export async function getPlaybackAction(matchId: string, half: "first" | "second") {
  if (half !== "first" && half !== "second") return { kind: "error" as const, message: "Unknown half." };
  const supabase = await createClient();
  return playbackForHalf(supabase, matchId, half);
}
