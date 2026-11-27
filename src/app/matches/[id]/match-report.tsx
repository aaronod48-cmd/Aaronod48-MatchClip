import { setFocusAction } from "@/app/matches/focus-actions";
import type { createClient } from "@/lib/supabase/server";
import { thisWeekStartSydney } from "@/lib/week";
import { ReportView, type ReportData } from "@/components/report-view";
import { ShareButton } from "./share-button";

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

  const data: ReportData = {
    scores: (report.report_scores as ReportData["scores"]) ?? [],
    items: (report.report_items as ReportData["items"]) ?? [],
  };

  return (
    <div className="space-y-2">
      <ReportView
        data={data}
        workonFooter={(itemId) =>
          focus?.report_item_id === itemId ? (
            <p className="text-sm font-semibold text-lime">Your focus this week ✓</p>
          ) : canSetFocus ? (
            <form action={setFocusAction}>
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="matchId" value={matchId} />
              <button
                type="submit"
                className="rounded-lg border border-workon px-3 py-1.5 text-sm font-semibold text-workon"
              >
                Set as my focus this week
              </button>
            </form>
          ) : null
        }
      />
      {canSetFocus && <ShareButton matchId={matchId} label="Share report with my coach" />}
    </div>
  );
}
