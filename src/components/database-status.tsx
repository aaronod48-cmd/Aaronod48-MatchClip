import { connection } from "next/server";
import { checkSupabaseConnection } from "@/lib/supabase/check-connection";

/** Shows whether the app can reach Supabase. Checked fresh on every page load. */
export async function DatabaseStatus() {
  await connection();
  const db = await checkSupabaseConnection();

  if (db.state === "connected") {
    return <p className="mt-2 font-semibold text-lime">Database connected ✓</p>;
  }
  if (db.state === "not-configured") {
    return (
      <p className="mt-2 text-muted">
        Database not set up yet. Add the Supabase settings in Vercel.
      </p>
    );
  }
  return <p className="mt-2 text-workon">Database problem: {db.reason}</p>;
}
