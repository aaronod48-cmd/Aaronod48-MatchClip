"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/auth-actions";
import { Field, Message, SubmitButton, TextLink } from "@/components/ui";

export function ForgotPasswordForm() {
  const expired = useSearchParams().get("link") === "expired";
  const [state, action] = useActionState(forgotPasswordAction, undefined);

  return (
    <form action={action} className="space-y-5">
      {expired && !state && (
        <Message kind="error">
          That link has expired or was already used. Links only work once, and best on the same phone or computer
          you asked from. Please request a new one.
        </Message>
      )}
      <p className="text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
      <p className="text-center text-sm">
        <TextLink href="/login">Back to log in</TextLink>
      </p>
    </form>
  );
}
