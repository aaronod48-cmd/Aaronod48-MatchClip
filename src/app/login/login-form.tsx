"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { logInAction, resendVerificationAction } from "@/app/auth-actions";
import { Field, Message, SubmitButton, TextLink } from "@/components/ui";

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(logInAction, undefined);
  const [resendState, resendAction] = useActionState(resendVerificationAction, undefined);

  return (
    <div className="space-y-5">
      {params.get("verified") === "maybe" && !state && (
        <Message kind="success">
          If you just tapped the link in your email, your email is verified. Please log in.
        </Message>
      )}
      {params.get("signedOut") && !state && <Message kind="info">You&apos;ve logged out.</Message>}

      <form action={action} className="space-y-5">
        <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {state?.error && <Message kind="error">{state.error}</Message>}
        <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
      </form>

      {state?.notice === "resend" && (
        <form action={resendAction} className="space-y-3">
          <input type="hidden" name="email" value={state.email ?? ""} />
          {resendState?.notice && <Message kind="success">{resendState.notice}</Message>}
          {resendState?.error && <Message kind="error">{resendState.error}</Message>}
          <SubmitButton pendingText="Sending…">Send a new verification link</SubmitButton>
        </form>
      )}

      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <TextLink href="/forgot-password">Forgot your password?</TextLink>
        <span>
          New here? <TextLink href="/signup">Create an account</TextLink>
        </span>
      </div>
    </div>
  );
}
