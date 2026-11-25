import Link from "next/link";
import { ageGroupFromBirthYear, ageRules } from "@/config/age-rules";
import { createClient } from "@/lib/supabase/server";

/*
 * The four home screens. Each one simply asks the database for data; the
 * database's access rules (Step 4) decide what comes back. So even if a
 * screen asked for too much, it could only ever get what that person is
 * allowed to see.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const roleLabels: Record<string, string> = {
  parent: "Parent or guardian",
  player: "Player",
  coach: "Coach",
  admin: "Admin",
};

function ageLabel(birthYear: number) {
  const group = ageGroupFromBirthYear(birthYear);
  if (group === "child") return `Under ${ageRules.ownLoginMinAge}`;
  if (group === "teen") return `${ageRules.ownLoginMinAge}–${ageRules.adultAge - 1}`;
  return `${ageRules.adultAge}+`;
}

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Sydney",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <li className="rounded-2xl border border-line bg-pitch-raised p-4">{children}</li>;
}

// ---------------- Parent ----------------

export async function ParentHome({ supabase }: { supabase: Supabase }) {
  const [{ data: children }, { data: consents }] = await Promise.all([
    supabase.from("players").select("id, first_name, birth_year, team_name").order("first_name"),
    supabase.from("consents").select("player_id, withdrawn_at"),
  ]);
  const consented = new Set((consents ?? []).filter((c) => !c.withdrawn_at).map((c) => c.player_id));

  return (
    <Section title="My children">
      {children?.length ? (
        <ul className="space-y-3">
          {children.map((c) => (
            <Card key={c.id}>
              <Link href={`/children/${c.id}`} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.first_name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {ageLabel(c.birth_year)}
                    {c.team_name ? ` · ${c.team_name}` : ""}
                  </p>
                  <p className={`mt-2 text-sm font-medium ${consented.has(c.id) ? "text-lime" : "text-workon"}`}>
                    {consented.has(c.id) ? "Consent given ✓" : "Consent needed"}
                  </p>
                </div>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </Link>
            </Card>
          ))}
        </ul>
      ) : (
        <Empty>You haven&apos;t added a child yet.</Empty>
      )}
      <div className="mt-4">
        <Link
          href="/children/new"
          className="block w-full rounded-xl bg-lime px-4 py-3 text-center font-semibold text-pitch"
        >
          Add a child
        </Link>
      </div>
    </Section>
  );
}

// ---------------- Player ----------------

export async function PlayerHome({ supabase }: { supabase: Supabase }) {
  // Only ever returns their own record (and, for under-18s, only with consent).
  const { data: me } = await supabase.from("players").select("first_name, team_name, birth_year").maybeSingle();
  const isMinor = me ? ageGroupFromBirthYear(me.birth_year) !== "adult" : false;
  return (
    <>
      {me && (
        <Section title="Me">
          <div className="rounded-2xl border border-line bg-pitch-raised p-4">
            <p className="font-semibold">{me.first_name}</p>
            {me.team_name && <p className="mt-1 text-sm text-muted">{me.team_name}</p>}
            {isMinor && <p className="mt-2 text-xs text-muted">Your parent or guardian manages your details.</p>}
          </div>
        </Section>
      )}
      <Section title="My matches">
        <Empty>No matches yet. Uploading a match video is coming soon.</Empty>
      </Section>
      <Section title="My focus this week">
        <Empty>When your coach sends a report, you can pick a work-on to focus on.</Empty>
      </Section>
    </>
  );
}

// ---------------- Coach ----------------

export async function CoachHome({ supabase }: { supabase: Supabase }) {
  // Only returns players this coach is assigned to (and, for under-18s,
  // only while a parent's consent is active). The database enforces it.
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, birth_year, team_name")
    .order("first_name");

  return (
    <Section title="My players">
      {players?.length ? (
        <ul className="space-y-3">
          {players.map((p) => (
            <Card key={p.id}>
              <p className="font-semibold">{p.first_name}</p>
              <p className="mt-1 text-sm text-muted">
                {ageLabel(p.birth_year)}
                {p.team_name ? ` · ${p.team_name}` : ""}
              </p>
            </Card>
          ))}
        </ul>
      ) : (
        <Empty>No players are assigned to you yet.</Empty>
      )}
    </Section>
  );
}

// ---------------- Admin ----------------

export async function AdminHome({ supabase, myId }: { supabase: Supabase; myId: string }) {
  const [{ data: accounts }, { count: playerCount }, { data: assigned }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, role, created_at").order("created_at", { ascending: false }),
    supabase.from("players").select("id", { count: "exact", head: true }),
    // Players assigned to me as coach (an admin can also coach).
    supabase.from("coach_assignments").select("player_id").eq("coach_id", myId).is("ended_at", null),
  ]);

  const counts = { parent: 0, player: 0, coach: 0, admin: 0 } as Record<string, number>;
  for (const a of accounts ?? []) counts[a.role] = (counts[a.role] ?? 0) + 1;

  return (
    <>
      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-3">
          {[
            ["Parents", counts.parent],
            ["Adult & teen players", counts.player],
            ["Children & players", playerCount ?? 0],
            ["Coaches & admins", counts.coach + counts.admin],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-pitch-raised p-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">Players assigned to you as coach: {assigned?.length ?? 0}</p>
      </Section>

      <Section title="Accounts">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-pitch-raised">
          {(accounts ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {a.display_name ?? "No name"}
                  {a.id === myId && <span className="text-muted"> (you)</span>}
                </p>
                <p className="text-xs text-muted">Joined {dateFormat.format(new Date(a.created_at))}</p>
              </div>
              <span className="shrink-0 rounded-full border border-line px-3 py-1 text-xs">
                {roleLabels[a.role] ?? a.role}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export { roleLabels };
