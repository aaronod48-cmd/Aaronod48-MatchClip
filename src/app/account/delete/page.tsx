import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell, Message, TextLink } from "@/components/ui";
import { ageGroupFromBirthYear } from "@/config/age-rules";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Delete my account" };

async function DeleteAccount() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", me).maybeSingle();
  const role = profile?.role;

  if (role === "player") {
    const { data: mine } = await supabase.from("players").select("birth_year").eq("user_id", me).maybeSingle();
    if (mine && ageGroupFromBirthYear(mine.birth_year) !== "adult") {
      return (
        <Message kind="info">
          Please ask your parent or guardian. They can remove your login or delete your profile from their account.
        </Message>
      );
    }
  }

  const deletes =
    role === "parent"
      ? [
          "Your account and login",
          "Each of your children (unless another parent or guardian is also linked to them, then only your link is removed)",
          "Their teen logins, consent records, matches, videos, clips and coach notes",
        ]
      : role === "player"
        ? ["Your account and login", "Your player profile", "Your matches, videos, clips and coach notes"]
        : ["Your account and login", "Your coach assignments (clips you made stay with the players)"];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-workon/50 bg-pitch-raised p-4 text-sm">
        <p className="font-semibold text-workon">This permanently deletes:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {deletes.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="mt-3 text-muted">Video and clip files are deleted from our video service too.</p>
      </div>
      <DeleteAccountForm />
      <p className="text-center text-sm">
        <TextLink href="/dashboard">Cancel</TextLink>
      </p>
    </div>
  );
}

export default function DeleteAccountPage() {
  return (
    <AuthShell title="Delete my account">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <DeleteAccount />
      </Suspense>
    </AuthShell>
  );
}
