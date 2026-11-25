import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { withdrawConsentAction } from "@/app/children/actions";
import { AuthShell, Message, TextLink } from "@/components/ui";
import { ageGroupFromBirthYear, ageRules } from "@/config/age-rules";
import { createClient } from "@/lib/supabase/server";
import { removeTeenLoginAction } from "@/app/children/teen-actions";
import { DeleteChildForm, GiveConsentForm, InviteTeenForm } from "./child-forms";

export const metadata: Metadata = { title: "Child" };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | undefined>>;

const dateTime = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function ageLabel(birthYear: number) {
  const g = ageGroupFromBirthYear(birthYear);
  return g === "child"
    ? `Under ${ageRules.ownLoginMinAge}`
    : g === "teen"
      ? `${ageRules.ownLoginMinAge}–${ageRules.adultAge - 1}`
      : `${ageRules.adultAge}+`;
}

async function Child({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // The database only returns this child if you're allowed to see them.
  const { data: child } = await supabase
    .from("players")
    .select("id, first_name, birth_year, team_name, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!child) notFound();

  const [{ data: consents }, { count: coachCount }] = await Promise.all([
    supabase
      .from("consents")
      .select("consent_version, given_at, withdrawn_at")
      .eq("player_id", id)
      .order("given_at", { ascending: false }),
    supabase
      .from("coach_assignments")
      .select("id", { count: "exact", head: true })
      .eq("player_id", id)
      .is("ended_at", null),
  ]);
  const active = consents?.find((c) => !c.withdrawn_at);
  const ageGroup = ageGroupFromBirthYear(child.birth_year);

  return (
    <div className="space-y-6">
      {q.added && <Message kind="success">{child.first_name} has been added. Thank you for giving consent.</Message>}
      {q.withdrawn && <Message kind="info">Consent withdrawn. Coaches can no longer see {child.first_name}.</Message>}
      {q.consented && <Message kind="success">Consent given again. Thank you.</Message>}
      {q.invited && (
        <Message kind="success">Invite sent. {child.first_name} will get an email to choose their password.</Message>
      )}
      {q.loginRemoved && <Message kind="info">{child.first_name}&apos;s own login has been removed.</Message>}
      {q.error && <Message kind="error">Something went wrong. Please try again.</Message>}

      <div>
        <h1 className="text-2xl font-bold">{child.first_name}</h1>
        <p className="mt-1 text-sm text-muted">
          {ageLabel(child.birth_year)} · born {child.birth_year}
          {child.team_name ? ` · ${child.team_name}` : ""}
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-pitch-raised p-4">
        <h2 className="font-semibold">Consent</h2>
        {active ? (
          <>
            <p className="mt-2 font-medium text-lime">Consent given ✓</p>
            <p className="mt-1 text-sm text-muted">
              {dateTime.format(new Date(active.given_at))} · wording {active.consent_version}
            </p>
            <form action={withdrawConsentAction} className="mt-4">
              <input type="hidden" name="playerId" value={child.id} />
              <button
                type="submit"
                className="w-full rounded-xl border border-workon/60 px-4 py-3 font-semibold text-workon"
              >
                Withdraw consent
              </button>
              <p className="mt-2 text-xs text-muted">
                Coaches lose access straight away. You can give consent again later.
              </p>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 font-medium text-workon">No consent at the moment</p>
            <p className="mt-1 text-sm text-muted">Coaches can&apos;t see {child.first_name} until you give consent.</p>
            <GiveConsentForm playerId={child.id} child={child.first_name} />
          </>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
        <h2 className="font-semibold">Own login</h2>
        {child.user_id ? (
          <>
            <p className="mt-2 font-medium text-lime">{child.first_name} has their own login ✓</p>
            <p className="mt-1 text-muted">
              They can see only their own record. You still see and control everything.
              {!active && " While consent is withdrawn, their login shows nothing."}
            </p>
            <form action={removeTeenLoginAction} className="mt-4">
              <input type="hidden" name="playerId" value={child.id} />
              <button type="submit" className="w-full rounded-xl border border-line px-4 py-3 font-semibold">
                Remove their login
              </button>
              <p className="mt-2 text-xs text-muted">Their profile stays here, managed by you.</p>
            </form>
          </>
        ) : ageGroup !== "teen" ? (
          <p className="mt-2 text-muted">
            Children under {ageRules.ownLoginMinAge} don&apos;t get their own login. You manage everything for{" "}
            {child.first_name}.
          </p>
        ) : !active ? (
          <p className="mt-2 text-muted">
            Give consent first, then you can invite {child.first_name} to their own login.
          </p>
        ) : (
          <InviteTeenForm playerId={child.id} child={child.first_name} />
        )}
      </section>

      <section className="rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
        <h2 className="font-semibold">Coach</h2>
        <p className="mt-2 text-muted">
          {coachCount ? `Assigned to ${coachCount} coach${coachCount > 1 ? "es" : ""}.` : "No coach assigned yet."}
        </p>
      </section>

      <DeleteChildForm playerId={child.id} child={child.first_name} />

      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}

export default function ChildPage(props: { params: Params; searchParams: Search }) {
  return (
    <AuthShell title="">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Child params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
