"use server";

import { revalidatePath } from "next/cache";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type ShareState = { error?: string; url?: string; days?: number } | undefined;

/** Create a private link that expires. The database checks it's the player or their parent. */
export async function createShareAction(_prev: ShareState, form: FormData): Promise<ShareState> {
  const matchId = String(form.get("matchId") ?? "");
  const clipId = String(form.get("clipId") ?? "") || null;
  const days = Number(form.get("days"));
  const note = String(form.get("note") ?? "");
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_share_link", {
    p_match: matchId,
    p_clip: clipId,
    p_days: days,
    p_note: note,
  });
  if (error || !token) {
    const ours = error?.code === "22023" || error?.code === "42501";
    return { error: ours ? error!.message : "Couldn't create the link. Please try again." };
  }
  revalidatePath(`/matches/${matchId}`);
  return { url: `${await siteOrigin()}/s/${token}`, days };
}

export async function stopShareAction(form: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("revoke_share_link", { p_link: String(form.get("linkId") ?? "") });
  revalidatePath(`/matches/${String(form.get("matchId") ?? "")}`);
}
