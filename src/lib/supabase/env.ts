/**
 * Reads the Supabase settings from the environment.
 *
 * These two values are SAFE to be public: they are designed to be visible
 * in the browser. Who can see which data is controlled by the database's
 * row-level security rules, not by hiding these values.
 *
 * Never put the secret / service_role key in a NEXT_PUBLIC_ variable.
 */
export function getSupabaseEnv(): { url: string; publishableKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url: url.replace(/\/+$/, ""), publishableKey };
}
