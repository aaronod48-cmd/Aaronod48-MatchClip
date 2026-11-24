import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, TextLink } from "@/components/ui";
import { CheckEmailText } from "./check-email-text";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthShell title="Check your email">
      <Suspense>
        <CheckEmailText />
      </Suspense>
      <ul className="mt-6 space-y-2 text-sm text-muted">
        <li>• It can take a minute or two to arrive.</li>
        <li>• Check your junk or spam folder.</li>
        <li>• Open the link on this same phone or computer if you can.</li>
      </ul>
      <p className="mt-8 text-sm">
        <TextLink href="/login">Back to log in</TextLink>
      </p>
    </AuthShell>
  );
}
