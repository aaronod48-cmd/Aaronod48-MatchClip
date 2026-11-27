"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReportInput = {
  matchId: string;
  scores: { slot: number; categoryId: string; score: number | null }[];
  strengths: { id?: string; body: string }[];
  workons: {
    id?: string;
    body: string;
    drill: { kind: "library"; drillId: string } | { kind: "new"; title: string; description: string } | null;
  }[];
};

const clean = (s: string, max: number) => s.trim().slice(0, max);

/**
 * Save the coach's report (as a draft, or as edits to a published one).
 * Everything goes through the database's rules: only this player's coach can
 * write it. Existing strengths/work-ons keep their ids, so a player's
 * "focus" on a work-on survives edits.
 */
export async function saveReportAction(input: ReportInput): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Find or start the report.
  let { data: report } = await supabase.from("reports").select("id").eq("match_id", input.matchId).maybeSingle();
  if (!report) {
    const { data, error } = await supabase.from("reports").insert({ match_id: input.matchId }).select("id").single();
    if (error || !data) return { error: "Only this player's coach can write the report." };
    report = data;
  }
  const reportId = report.id;

  // ---- Scores: four slots, 1-10, category name copied in ----
  const chosen = input.scores.filter((s) => s.categoryId && s.score !== null);
  if (new Set(chosen.map((s) => s.categoryId)).size !== chosen.length) {
    return { error: "Each score needs a different category." };
  }
  const { data: cats } = await supabase.from("score_categories").select("id, name");
  const nameOf = new Map((cats ?? []).map((c) => [c.id, c.name]));
  await supabase.from("report_scores").delete().eq("report_id", reportId);
  if (chosen.length) {
    const { error } = await supabase.from("report_scores").insert(
      chosen.map((s) => ({
        report_id: reportId,
        slot: s.slot,
        category_id: s.categoryId,
        category_name: nameOf.get(s.categoryId) ?? "Score",
        score: Math.min(10, Math.max(1, Math.round(Number(s.score)))),
      })),
    );
    if (error) return { error: "Couldn't save the scores." };
  }

  // ---- Strengths and work-ons ----
  const { data: existing } = await supabase.from("report_items").select("id").eq("report_id", reportId);
  const keep = new Set<string>();

  const rows: Record<string, unknown>[] = [];
  input.strengths
    .filter((s) => s.body.trim())
    .forEach((s, i) => rows.push({ id: s.id, kind: "strength", body: clean(s.body, 500), sort_order: i }));

  for (const [i, w] of input.workons.filter((w) => w.body.trim()).entries()) {
    let drill: { drill_id: string | null; drill_title: string | null; drill_description: string | null } = {
      drill_id: null,
      drill_title: null,
      drill_description: null,
    };
    if (w.drill?.kind === "library") {
      const { data: d } = await supabase
        .from("drills")
        .select("id, title, description")
        .eq("id", w.drill.drillId)
        .maybeSingle();
      if (d) drill = { drill_id: d.id, drill_title: d.title, drill_description: d.description };
    } else if (w.drill?.kind === "new" && w.drill.title.trim()) {
      // A new drill is saved to the library for next time.
      const { data: d, error } = await supabase
        .from("drills")
        .insert({ title: clean(w.drill.title, 80), description: clean(w.drill.description, 1000) || null })
        .select("id, title, description")
        .single();
      if (error || !d) return { error: "Couldn't save the new drill." };
      drill = { drill_id: d.id, drill_title: d.title, drill_description: d.description };
    }
    rows.push({ id: w.id, kind: "workon", body: clean(w.body, 500), sort_order: i, ...drill });
  }

  for (const row of rows) {
    const { id, kind, ...fields } = row as { id?: string; kind: string } & Record<string, unknown>;
    if (id && existing?.some((e) => e.id === id)) {
      keep.add(id);
      const { error } = await supabase.from("report_items").update(fields).eq("id", id);
      if (error) return { error: "Couldn't save the report." };
    } else {
      const { error } = await supabase.from("report_items").insert({ report_id: reportId, kind, ...fields });
      if (error) return { error: "Couldn't save the report." };
    }
  }
  const remove = (existing ?? []).map((e) => e.id).filter((id) => !keep.has(id));
  if (remove.length) await supabase.from("report_items").delete().in("id", remove);

  revalidatePath(`/review/${input.matchId}`);
  return {};
}
