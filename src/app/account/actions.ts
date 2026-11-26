"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processDeletionsQuietly } from "@/lib/video/deletions";

export type DeleteAccountState = { error?: string } | undefined;

/**
 * Delete my account, for real:
 *  1. As the logged-in person, the database deletes everything they own
 *     (children without another parent, matches, videos, clips, consents...)
 *     and hands back any teen logins that must go too.
 *  2. The server deletes those teen logins and then this login.
 *  3. Video and clip files are deleted at the video service.
 */
export async function deleteMyAccountAction(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  if (
    String(form.get("confirmText") ?? "")
      .trim()
      .toLowerCase() !== "delete"
  ) {
    return { error: 'Please type "delete" to confirm.' };
  }
  if (form.get("confirmDelete") !== "yes") return { error: "Please tick the box to confirm." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");

  const admin = createAdminClient();
  if (!admin) return { error: "Account deletion isn't set up yet. Please contact support." };

  const { data: teenLogins, error } = await supabase.rpc("delete_my_data");
  if (error) {
    const ours = error.code === "22023" || error.code === "42501";
    return { error: ours ? error.message : "Something went wrong. Nothing has been deleted. Please try again." };
  }

  for (const teen of (teenLogins as string[] | null) ?? []) {
    await admin.auth.admin.deleteUser(teen);
  }
  const { error: loginError } = await admin.auth.admin.deleteUser(me);
  if (loginError) {
    console.error("Account data deleted but login removal failed", me, loginError);
    return { error: "Your data was deleted, but we couldn't remove your login. Please contact support." };
  }

  await processDeletionsQuietly();
  await supabase.auth.signOut();
  redirect("/login?accountDeleted=1");
}
