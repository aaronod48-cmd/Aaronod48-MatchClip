import Link from "next/link";
import { formatMatchDate, matchStatusLabels } from "@/lib/matches";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const toneClass = { muted: "text-muted", lime: "text-lime", workon: "text-workon" };

/** A player's matches, newest first. The database only returns what you may see. */
export async function MatchList({ supabase, playerId }: { supabase: Supabase; playerId: string }) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, match_date, opponent, status")
    .eq("player_id", playerId)
    .order("match_date", { ascending: false })
    .limit(50);

  if (!matches?.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        No matches yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const s = matchStatusLabels[m.status] ?? { label: m.status, tone: "muted" as const };
        return (
          <li key={m.id}>
            <Link
              href={`/matches/${m.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-pitch-raised p-4"
            >
              <span>
                <span className="block font-medium">
                  {formatMatchDate(m.match_date)}
                  {m.opponent ? ` v ${m.opponent}` : ""}
                </span>
                <span className={`block text-sm ${toneClass[s.tone]}`}>{s.label}</span>
              </span>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
