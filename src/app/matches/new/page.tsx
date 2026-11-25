import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell, Message, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AdultProfileForm, NewMatchForm } from "./new-match-forms";

export const metadata: Metadata = { title: "Add a match" };

type Search = Promise<{ player?: string }>;

async function NewMatch({ searchParams }: { searchParams: Search }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", me).maybeSingle();
  const role = profile?.role;

  if (role === "parent") {
    // Children with active consent (the database only returns this parent's own).
    const [{ data: kids }, { data: consents }] = await Promise.all([
      supabase.from("players").select("id, first_name").order("first_name"),
      supabase.from("consents").select("player_id").is("withdrawn_at", null),
    ]);
    const ok = new Set((consents ?? []).map((c) => c.player_id));
    const players = (kids ?? []).filter((k) => ok.has(k.id)).map((k) => ({ id: k.id, name: k.first_name }));
    if (!players.length) {
      return (
        <Message kind="info">
          Add a child (with consent) first, then you can upload their matches.{" "}
          <TextLink href="/children/new">Add a child</TextLink>
        </Message>
      );
    }
    const { player } = await searchParams;
    return <NewMatchForm players={players} preselected={players.some((p) => p.id === player) ? player : undefined} />;
  }

  if (role === "player") {
    const { data: mine } = await supabase.from("players").select("id, first_name").eq("user_id", me).maybeSingle();
    if (!mine) return <AdultProfileForm />;
    return <NewMatchForm players={[{ id: mine.id, name: mine.first_name }]} preselected={mine.id} />;
  }

  return <Message kind="info">Only players and parents upload matches.</Message>;
}

export default function NewMatchPage(props: { searchParams: Search }) {
  return (
    <AuthShell title="Add a match">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <NewMatch searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
