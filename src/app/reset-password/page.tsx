import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm />
    </AuthShell>
  );
}
