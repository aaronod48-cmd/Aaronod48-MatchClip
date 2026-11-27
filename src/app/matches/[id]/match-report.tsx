import { setFocusAction } from "@/app/matches/focus-actions";
import type { createClient } from "@/lib/supabase/server";
import { thisWeekStartSydney } from "@/lib/week";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The coach's report, as the player and parent see it. The database only
 * returns a PUBLISHED report to them.
 */
export async function MatchReport({
  supabase,
  matchId,
  playerId,
  canSetFocus,
}: {
  supabase: Supabase;
  matchId: string;
  playerId: string;
  canSetFocus: boolean;
}) {
  const { data: report } = await supabase
    .from("reports")
    .select(
      "id, status, report_scores(slot, category_name, score), report_items(id, kind, body, sort_order, drill_title, drill_description)",
    )
    .eq("match_id", matchId)
    .eq("status", "published")
    .maybeSingle();
  if (!report) return null;

  const { data: focus } = await supabase
    .from("player_focus")
    .select("report_item_id")
    .eq("player_id", playerId)
    .eq("week_start", thisWeekStartSydney())
    .maybeSingle();

  const scores = ((report.report_scores as { slot: number; category_name: string; score: number }[]) ?? []).sort(
    (a, b) => a.slot - b.slot,
  );
  const items = (
    (report.report_items as {
      id: string;
      kind: string;
      body: string;
      sort_order: number;
      drill_title: string | null;
      drill_description: string | null;
    }[]) ?? []
  ).sort((a, b) => a.sort_order - b.sort_order);
  const strengths = items.filter((i) => i.kind === "strength");
  const workons = items.filter((i) => i.kind === "workon");

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-pitch-raised p-4" aria-labelledby="match-report">
      <h2 id="match-report" className="text-lg font-semibold">
        Coach&apos;s report
      </h2>

      <ul className="space-y-3" aria-label="Scores">
        {scores.map((s) => (
          <li key={s.slot}>
            <div className="flex justify-between text-sm">
              <span>{s.category_name}</span>
              <span className="font-semibold">{s.score}/10</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-lime" style={{ width: `${s.score * 10}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {strengths.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-lime">Strengths</h3>
          <ul className="mt-2 space-y-2">
            {strengths.map((s) => (
              <li key={s.id} className="rounded-xl border-l-4 border-lime bg-pitch px-3 py-2">
                {s.body}
              </li>
            ))}
          </ul>
        </div>
      )}

      {workons.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-workon">Work-ons</h3>
          <ul className="mt-2 space-y-3">
            {workons.map((w) => {
              const isFocus = focus?.report_item_id === w.id;
              return (
                <li key={w.id} className="space-y-2 rounded-xl border-l-4 border-workon bg-pitch px-3 py-3">
                  <p>{w.body}</p>
                  {w.drill_title && (
                    <div className="rounded-lg border border-line p-2 text-sm">
                      <p className="font-semibold">Drill: {w.drill_title}</p>
                      {w.drill_description && <p className="mt-1 text-muted">{w.drill_description}</p>}
                    </div>
                  )}
                  {isFocus ? (
                    <p className="text-sm font-semibold text-lime">Your focus this week ✓</p>
                  ) : (
                    canSetFocus && (
                      <form action={setFocusAction}>
                        <input type="hidden" name="itemId" value={w.id} />
                        <input type="hidden" name="matchId" value={matchId} />
                        <button
                          type="submit"
                          className="rounded-lg border border-workon px-3 py-1.5 text-sm font-semibold text-workon"
                        >
                          Set as my focus this week
                        </button>
                      </form>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
