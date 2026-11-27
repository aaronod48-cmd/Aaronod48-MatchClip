import { stopShareAction } from "@/app/matches/share-actions";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const when = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

/** Loads the links and works out each one's status (kept outside the drawing code). */
async function loadLinks(supabase: Supabase, matchId: string) {
  const { data: links } = await supabase
    .from("share_links")
    .select("id, kind, clip_id, note, created_at, expires_at, revoked_at, share_link_views(count)")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return (links ?? []).map((l) => ({
    ...l,
    views: (l.share_link_views as unknown as { count: number }[])?.[0]?.count ?? 0,
    status: l.revoked_at ? "Stopped" : new Date(l.expires_at).getTime() <= now ? "Expired" : "Active",
  }));
}

/**
 * Every link shared for this match. The database only shows them to the
 * player and their parent (the parent also sees links their teen made).
 */
export async function SharedLinks({
  supabase,
  matchId,
  clipNumbers,
}: {
  supabase: Supabase;
  matchId: string;
  clipNumbers: Map<string, number>;
}) {
  const links = await loadLinks(supabase, matchId);
  if (!links.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="shared-links">
      <h2 id="shared-links" className="font-semibold">
        Shared links
      </h2>
      <ul className="space-y-2">
        {links.map((l) => {
          const { views, status } = l;
          const what = l.kind === "report" ? "Report" : `Clip ${clipNumbers.get(l.clip_id ?? "") ?? ""}`.trim();
          return (
            <li key={l.id} className="rounded-xl border border-line bg-pitch-raised p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {what}
                  {l.note ? ` · ${l.note}` : ""}
                </span>
                <span className={status === "Active" ? "text-lime" : "text-muted"}>{status}</span>
              </div>
              <p className="mt-1 text-muted">
                {status === "Active"
                  ? `Works until ${when.format(new Date(l.expires_at))}`
                  : `Made ${when.format(new Date(l.created_at))}`}{" "}
                · Opened {views} time{views === 1 ? "" : "s"}
              </p>
              {status === "Active" && (
                <form action={stopShareAction} className="mt-2">
                  <input type="hidden" name="linkId" value={l.id} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <button type="submit" className="text-workon underline">
                    Stop sharing
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
