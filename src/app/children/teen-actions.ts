"use server";

import { redirect } from "next/navigation";
import { isValidEmail } from "@/lib/auth/validation";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TeenFormState = { error?: string } | undefined;

/**
 * Invite a 13-17-year-old to their own login.
 * 1. As the logged-in parent, the database checks they're allowed (check_teen_invite).
 * 2. Only then, with the secret key, the invite is created and sent.
 * 3. The new login is joined to the child (link_teen_login repeats every check).
 *    If that fails, the invite is deleted again, so nothing is left half-done.
 */
export async function inviteTeenAction(_prev: TeenFormState, form: FormData): Promise<TeenFormState> {
  const playerId = String(form.get("playerId") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const parentId = claims?.claims?.sub;
  if (!parentId) redirect("/login");
  if (email === String(claims?.claims?.email ?? "").toLowerCase()) {
    return { error: "Please use your child's own email address, not yours." };
  }

  const { data: firstName, error: checkError } = await supabase.rpc("check_teen_invite", { p_player: playerId });
  if (checkError || !firstName) {
    const known = checkError?.code === "22023" || checkError?.code === "42501";
    return { error: known ? checkError!.message : "Something went wrong. Please try again." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Invites aren't set up yet (missing server key). Please contact support." };

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { account_type: "player", display_name: firstName },
    redirectTo: `${await siteOrigin()}/auth/accept-invite`,
  });
  if (inviteError || !invited?.user) {
    const msg = (inviteError?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { error: "That email already has an account. Please use a different email for your child." };
    }
    if (msg.includes("rate") || msg.includes("limit")) {
      return { error: "Too many emails sent recently. Please wait a while and try again." };
    }
    return { error: "Couldn't send the invite. Please try again." };
  }

  const { error: linkError } = await admin.rpc("link_teen_login", {
    p_player: playerId,
    p_user: invited.user.id,
    p_guardian: parentId,
  });
  if (linkError) {
    await admin.auth.admin.deleteUser(invited.user.id); // undo: never leave a stray login
    return { error: "Couldn't finish setting up the login. Please try again." };
  }

  redirect(`/children/${playerId}?invited=1`);
}

/** Remove a teen's own login. Their profile stays, managed by the parent. */
export async function removeTeenLoginAction(form: FormData): Promise<void> {
  const playerId = String(form.get("playerId") ?? "");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");

  // Must be THIS child's own parent/guardian (not an admin, not the teen).
  const { data: child } = await supabase.from("players").select("user_id").eq("id", playerId).maybeSingle();
  const { data: isGuardian } = await supabase
    .from("guardianships")
    .select("player_id")
    .eq("player_id", playerId)
    .eq("guardian_id", me)
    .maybeSingle();
  if (!child?.user_id || !isGuardian) redirect(`/children/${playerId}?error=1`);

  const admin = createAdminClient();
  const { error } = admin ? await admin.auth.admin.deleteUser(child.user_id) : { error: true };
  redirect(`/children/${playerId}?${error ? "error=1" : "loginRemoved=1"}`);
}
