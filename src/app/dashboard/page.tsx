import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { logOutAction } from "@/app/auth-actions";
import { AuthShell, Message } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

const roleLabels: Record<string, string> = {
  parent: "Parent or guardian",
  player: "Player",
  coach: "Coach",
  admin: "Admin",
};

async function Welcome({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // Read through the database's access rules: you can only ever get your own profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", claims.claims.sub)
    .maybeSingle();

  const { updated } = await searchParams;

  return (
    <div className="space-y-5">
      {updated === "password" && <Message kind="success">Your new password is saved.</Message>}
      <p className="text-lg">
        Hi {profile?.display_name ?? "there"}, you&apos;re signed in.
      </p>
      <div className="rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
        <p className="text-muted">Account type</p>
        <p className="mt-1 font-semibold text-lime">{roleLabels[profile?.role ?? ""] ?? "Unknown"}</p>
        <p className="mt-3 text-muted">Email</p>
        <p className="mt-1 break-all">{String(claims.claims.email ?? "")}</p>
      </div>
      <p className="text-sm text-muted">Your own home screen is coming in the next step.</p>
    </div>
  );
}

export default function DashboardPage(props: { searchParams: Promise<{ updated?: string }> }) {
  return (
    <AuthShell title="Welcome">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Welcome searchParams={props.searchParams} />
      </Suspense>
      <form action={logOutAction} className="mt-8">
        <button type="submit" className="w-full rounded-xl border border-line px-4 py-3 font-semibold">
          Log out
        </button>
      </form>
    </AuthShell>
  );
}
