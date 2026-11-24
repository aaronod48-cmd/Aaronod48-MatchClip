import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseEnv } from "./env";

/**
 * A Supabase connection for the current visitor, used on the server.
 * It acts AS that person, so the database's access rules (Step 4) apply.
 */
export async function createClient() {
  // Read cookies first: this tells Next.js the page depends on who is visiting,
  // so it is never built in advance.
  const cookieStore = await cookies();
  // Pages using this are about one person, right now: never build them in
  // advance (they also use today's date, e.g. to work out a child's age group).
  await connection();
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase settings are missing (see .env.example).");

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Pages can't set cookies while rendering; the proxy (src/proxy.ts)
          // refreshes the login cookie on every request instead.
        }
      },
    },
  });
}
