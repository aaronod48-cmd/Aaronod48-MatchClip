"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** "Set as my focus this week". The database checks it's the player or their parent. */
export async function setFocusAction(form: FormData): Promise<void> {
  const itemId = String(form.get("itemId") ?? "");
  const matchId = String(form.get("matchId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_focus", { p_item: itemId });
  if (error) console.error("set_focus failed", error.message);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/dashboard");
}
