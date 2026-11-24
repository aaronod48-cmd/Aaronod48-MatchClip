"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/auth-actions";
import { Field, Message, SubmitButton } from "@/components/ui";
import { passwordRules } from "@/lib/auth/validation";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={passwordRules.minLength}
        hint={passwordRules.description}
      />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
