import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where links in our emails land (verify email, reset password).
 * Swaps the one-time code in the link for a login, then moves on.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const isReset = next === "/reset-password";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return to(next);
  }

  // The link was old, already used, or opened in a different browser/app
  // from the one used to sign up. For sign-up, the email IS verified by now.
  if (isReset) return to("/forgot-password?link=expired");
  return to("/login?verified=maybe");
}
