"use server";

import { redirect } from "next/navigation";
import { processDeletionsQuietly } from "@/lib/video/deletions";
import { consent } from "@/config/consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChildFormState = { error?: string } | undefined;

/** Our own database checks give plain-English messages; show those as they are. */
function dbMessage(error: { code?: string; message: string } | null): string {
  if (error && (error.code === "22023" || error.code === "42501")) return error.message;
  return "Something went wrong. Please try again.";
}

export async function addChildAction(_prev: ChildFormState, form: FormData): Promise<ChildFormState> {
  const supabase = await createClient();
  const { data: playerId, error } = await supabase.rpc("add_child", {
    p_first_name: String(form.get("firstName") ?? ""),
    p_birth_year: Number(form.get("birthYear")),
    p_team_name: String(form.get("teamName") ?? ""),
    p_consent_version: String(form.get("consentVersion") ?? ""),
    p_consent_confirmed: form.get("consentConfirmed") === "yes",
  });
  if (error || !playerId) return { error: dbMessage(error) };
  redirect(`/children/${playerId}?added=1`);
}

export async function withdrawConsentAction(form: FormData): Promise<void> {
  const playerId = String(form.get("playerId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_consent", { p_player: playerId });
  redirect(`/children/${playerId}?${error ? "error=withdraw" : "withdrawn=1"}`);
}

export async function giveConsentAction(_prev: ChildFormState, form: FormData): Promise<ChildFormState> {
  const playerId = String(form.get("playerId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("give_consent", {
    p_player: playerId,
    p_consent_version: consent.version,
    p_consent_confirmed: form.get("consentConfirmed") === "yes",
  });
  if (error) return { error: dbMessage(error) };
  redirect(`/children/${playerId}?consented=1`);
}

export async function deleteChildAction(_prev: ChildFormState, form: FormData): Promise<ChildFormState> {
  const playerId = String(form.get("playerId") ?? "");
  if (form.get("confirmDelete") !== "yes") {
    return { error: "Please tick the box to confirm you want to delete everything." };
  }
  const supabase = await createClient();
  // The database only lets this child's parent (or an admin) delete them.
  const { data, error } = await supabase.from("players").delete().eq("id", playerId).select("first_name, user_id");
  if (error || !data?.length) return { error: "Couldn't delete. Please try again." };

  // If the child had their own login (a teen), delete that login too.
  // Only reached after the database has confirmed the delete was allowed.
  if (data[0].user_id) {
    const admin = createAdminClient();
    const { error: loginError } = admin
      ? await admin.auth.admin.deleteUser(data[0].user_id)
      : { error: new Error("missing server key") };
    if (loginError) console.error("Child deleted but their login could not be deleted", data[0].user_id);
  }
  await processDeletionsQuietly(); // delete their videos and clips at the video service now
  redirect(`/dashboard?deleted=${encodeURIComponent(data[0].first_name)}`);
}
