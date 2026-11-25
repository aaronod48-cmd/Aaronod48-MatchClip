import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase connection with the SECRET key. It bypasses the database's
 * access rules, so it is only ever used on the server, for the few things
 * a normal login can't do (sending a teen's invite, removing a login).
 * "server-only" above makes the build fail if this is ever imported into
 * a page that runs in the browser.
 *
 * Every use must first check, as the logged-in parent, that they are
 * allowed (see src/app/children/teen-actions.ts).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
