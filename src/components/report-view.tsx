import type { ReactNode } from "react";

export type ReportData = {
  scores: { slot: number; category_name: string; score: number }[];
  items: {
    id: string;
    kind: string;
    body: string;
    sort_order: number;
    drill_title: string | null;
    drill_description: string | null;
  }[];
};

/**
 * The coach's report: scores (bars out of 10), strengths (lime) and
 * work-ons (orange) with their drills. Used on the match page and on shared links.
 */
export function ReportView({
  data,
  workonFooter,
  heading = "Coach's report",
}: {
  data: ReportData;
  workonFooter?: (itemId: string) => ReactNode;
  heading?: string;
}) {
  const scores = [...data.scores].sort((a, b) => a.slot - b.slot);
  const items = [...data.items].sort((a, b) => a.sort_order - b.sort_order);
  const strengths = items.filter((i) => i.kind === "strength");
  const workons = items.filter((i) => i.kind === "workon");

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-pitch-raised p-4" aria-labelledby="match-report">
      <h2 id="match-report" className="text-lg font-semibold">
        {heading}
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
            {workons.map((w) => (
              <li key={w.id} className="space-y-2 rounded-xl border-l-4 border-workon bg-pitch px-3 py-3">
                <p>{w.body}</p>
                {w.drill_title && (
                  <div className="rounded-lg border border-line p-2 text-sm">
                    <p className="font-semibold">Drill: {w.drill_title}</p>
                    {w.drill_description && <p className="mt-1 text-muted">{w.drill_description}</p>}
                  </div>
                )}
                {workonFooter?.(w.id)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
