import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell title="Log in">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
