import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { logOutAction } from "@/app/auth-actions";
import { Message } from "@/components/ui";
import { brand } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { AdminHome, CoachHome, ParentHome, PlayerHome, roleLabels } from "./homes";

export const metadata: Metadata = { title: "Home" };

async function Home({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; deleted?: string; matchDeleted?: string; defaultCoach?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const myId = claims?.claims?.sub;
  if (!myId) redirect("/login");

  // You can only ever read your own profile (database rule), so this is "me".
  const { data: profile } = await supabase.from("profiles").select("display_name, role").eq("id", myId).maybeSingle();
  const role = profile?.role ?? "parent";
  const { updated, deleted, matchDeleted, defaultCoach } = await searchParams;

  return (
    <>
      {deleted && (
        <div className="mt-4">
          <Message kind="info">{deleted} and everything about them has been deleted.</Message>
        </div>
      )}
      {defaultCoach && (
        <div className="mt-4">
          <Message kind="success">
            You&apos;re now the default coach. Players without a coach have been assigned to you.
          </Message>
        </div>
      )}
      {matchDeleted && (
        <div className="mt-4">
          <Message kind="info">The match and its videos have been deleted.</Message>
        </div>
      )}
      {updated === "password" && (
        <div className="mt-4">
          <Message kind="success">Your new password is saved.</Message>
        </div>
      )}
      <div className="mt-6">
        <h1 className="text-2xl font-bold">Hi {profile?.display_name ?? "there"}</h1>
        <p className="mt-1 text-sm text-lime">{roleLabels[role] ?? role}</p>
      </div>

      {role === "parent" && <ParentHome supabase={supabase} />}
      {role === "player" && <PlayerHome supabase={supabase} />}
      {role === "coach" && <CoachHome supabase={supabase} />}
      {role === "admin" && <AdminHome supabase={supabase} myId={myId} />}
    </>
  );
}

export default function DashboardPage(props: {
  searchParams: Promise<{ updated?: string; deleted?: string; matchDeleted?: string; defaultCoach?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src={brand.logo} alt="" width={32} height={32} priority />
          <span className="text-lg font-bold tracking-tight">{brand.name}</span>
        </Link>
        <form action={logOutAction}>
          <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm">
            Log out
          </button>
        </form>
      </header>

      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <Home searchParams={props.searchParams} />
      </Suspense>

      <p className="mt-12 text-center text-xs">
        <Link href="/account/delete" className="text-muted underline">
          Delete my account
        </Link>
      </p>
    </main>
  );
}
