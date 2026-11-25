"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase in the browser. Only used where a link puts the login in the page address. */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
