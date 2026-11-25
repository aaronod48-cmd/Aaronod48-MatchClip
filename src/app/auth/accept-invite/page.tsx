import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { title: "Set up your login" };

export default function AcceptInvitePage() {
  return (
    <AuthShell title="Set up your login">
      <AcceptInviteForm />
    </AuthShell>
  );
}
