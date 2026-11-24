import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account">
      <SignUpForm />
    </AuthShell>
  );
}
