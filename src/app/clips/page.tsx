import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell, TextLink } from "@/components/ui";
import { formatMatchDate, halfLabels } from "@/lib/matches";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search clips" };

type Search = Promise<{ tag?: string }>;

type Hit = {
  clip_id: string;
  clips: {
    start_seconds: number;
    strength_note: string | null;
    workon_note: string | null;
    status: string;
    match_id: string;
    match_videos: { half: "first" | "second" } | null;
    matches: { match_date: string; opponent: string | null; players: { first_name: string } | null } | null;
  } | null;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Search clips by tag. Only coach-confirmed tags count, and the database
 * decides what each person sees: a coach sees their players' clips (drafts
 * included); players and parents see only their own published clips.
 */
async function Results({ searchParams }: { searchParams: Search }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");
  const [{ data: profile }, { data: tags }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", me).maybeSingle(),
    supabase.from("tags").select("id, name, is_active").order("sort_order").order("name"),
  ]);
  const isStaff = profile?.role === "coach" || profile?.role === "admin";
  const { tag } = await searchParams;
  const chosen = (tags ?? []).find((t) => t.id === tag);

  let hits: Hit[] = [];
  if (chosen) {
    const { data } = await supabase
      .from("clip_tags")
      .select(
        "clip_id, clips(start_seconds, strength_note, workon_note, status, match_id, match_videos(half), matches(match_date, opponent, players(first_name)))",
      )
      .eq("tag_id", chosen.id)
      .not("confirmed_by", "is", null)
      .limit(200);
    hits = ((data ?? []) as unknown as Hit[])
      .filter((h) => h.clips && h.clips.matches)
      .sort((a, b) => (b.clips!.matches!.match_date > a.clips!.matches!.match_date ? 1 : -1));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="list" aria-label="Tags">
        {(tags ?? [])
          .filter((t) => t.is_active || t.id === tag)
          .map((t) => (
            <Link
              key={t.id}
              role="listitem"
              href={`/clips?tag=${t.id}`}
              aria-current={t.id === tag ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${t.id === tag ? "border-lime bg-lime text-pitch" : "border-line"}`}
            >
              {t.name}
            </Link>
          ))}
      </div>

      {!chosen && <p className="text-muted">Choose a tag to see every clip with it.</p>}

      {chosen && (
        <section aria-labelledby="results">
          <h2 id="results" className="font-semibold">
            {hits.length} clip{hits.length === 1 ? "" : "s"} tagged &quot;{chosen.name}&quot;
          </h2>
          {hits.length === 0 && <p className="mt-2 text-sm text-muted">No clips with this tag yet.</p>}
          <ul className="mt-3 space-y-3">
            {hits.map((h) => {
              const c = h.clips!;
              const m = c.matches!;
              const href = isStaff ? `/review/${c.match_id}` : `/matches/${c.match_id}`;
              return (
                <li key={h.clip_id}>
                  <Link href={href} className="block space-y-1 rounded-2xl border border-line bg-pitch-raised p-4">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {m.players?.first_name} · {formatMatchDate(m.match_date)}
                        {m.opponent ? ` v ${m.opponent}` : ""}
                      </span>
                      {c.status === "draft" && <span className="text-xs text-workon">Draft</span>}
                    </div>
                    <p className="text-xs text-muted">
                      {c.match_videos ? `${halfLabels[c.match_videos.half]} · ` : ""}
                      {clock(Number(c.start_seconds))}
                    </p>
                    {c.strength_note && <p className="text-sm text-lime">{c.strength_note}</p>}
                    {c.workon_note && <p className="text-sm text-workon">{c.workon_note}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}

export default function ClipsSearchPage(props: { searchParams: Search }) {
  return (
    <AuthShell title="Search clips by tag">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
