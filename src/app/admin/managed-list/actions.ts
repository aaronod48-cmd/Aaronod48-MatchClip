"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TagState = { error?: string; ok?: string } | undefined;

/** The admin-managed lists that share this screen. Anything else is refused. */
const LISTS = { tags: "/admin/tags", score_categories: "/admin/score-categories" } as const;
type List = keyof typeof LISTS;
function listFrom(form: FormData): List {
  const t = String(form.get("list") ?? "");
  if (t !== "tags" && t !== "score_categories") throw new Error("Unknown list");
  return t;
}

function message(error: { code?: string } | null): string {
  if (error?.code === "23505") return "That name already exists.";
  if (error?.code === "23514") return "Names must be 1 to 40 characters.";
  return "Only an admin can change this list.";
}

// Every change goes through the database's rules: only an admin can manage these lists.

export async function addTagAction(_prev: TagState, form: FormData): Promise<TagState> {
  const list = listFrom(form);
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 40) return { error: "Names must be 1 to 40 characters." };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from(list)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const { error } = await supabase.from(list).insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) return { error: message(error) };
  revalidatePath(LISTS[list]);
  return { ok: `Added "${name}".` };
}

export async function renameTagAction(_prev: TagState, form: FormData): Promise<TagState> {
  const list = listFrom(form);
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 40) return { error: "Names must be 1 to 40 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from(list).update({ name }).eq("id", id).select("id");
  if (error || !data?.length) return { error: message(error) };
  revalidatePath(LISTS[list]);
  return { ok: "Saved." };
}

export async function setTagActiveAction(form: FormData): Promise<void> {
  const list = listFrom(form);
  const supabase = await createClient();
  await supabase
    .from(list)
    .update({ is_active: form.get("active") === "yes" })
    .eq("id", String(form.get("id") ?? ""));
  revalidatePath(LISTS[list]);
}

/** Swap a tag with the one above or below it. */
export async function moveTagAction(form: FormData): Promise<void> {
  const list = listFrom(form);
  const id = String(form.get("id") ?? "");
  const direction = form.get("direction") === "up" ? "up" : "down";
  const supabase = await createClient();
  const { data: tags } = await supabase.from(list).select("id, sort_order").order("sort_order").order("name");
  if (!tags) return;
  const i = tags.findIndex((t) => t.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= tags.length) return;
  // Renumber everything 1..n with the two swapped, so the order is always tidy.
  [tags[i], tags[j]] = [tags[j], tags[i]];
  for (const [index, t] of tags.entries()) {
    if (t.sort_order !== index + 1)
      await supabase
        .from(list)
        .update({ sort_order: index + 1 })
        .eq("id", t.id);
  }
  revalidatePath(LISTS[list]);
}
