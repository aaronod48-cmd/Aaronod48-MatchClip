import { getSupabaseEnv } from "./env";

export type ConnectionStatus =
  | { state: "connected" }
  | { state: "not-configured" }
  | { state: "error"; reason: string };

/**
 * Asks Supabase "are you there, and is this key valid?".
 * Shows a plain-English reason if not, so the owner can fix the setting.
 */
export async function checkSupabaseConnection(
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionStatus> {
  const env = getSupabaseEnv();
  if (!env) return { state: "not-configured" };

  let url: URL;
  try {
    url = new URL("/auth/v1/health", env.url);
  } catch {
    return { state: "error", reason: "The Project URL doesn't look right. It should start with https://" };
  }

  try {
    const res = await fetchImpl(url, {
      headers: { apikey: env.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { state: "connected" };
    if (res.status === 401 || res.status === 403) {
      return { state: "error", reason: "Supabase didn't accept the key. Check you copied the publishable (anon) key in full." };
    }
    return { state: "error", reason: `Supabase answered with an error (code ${res.status}). The project may be paused.` };
  } catch {
    return { state: "error", reason: "Couldn't reach Supabase. Check the Project URL, or the project may be paused." };
  }
}
