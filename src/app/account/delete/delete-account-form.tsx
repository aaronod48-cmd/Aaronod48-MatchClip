"use client";

import { useActionState } from "react";
import { deleteMyAccountAction } from "@/app/account/actions";
import { Field, Message } from "@/components/ui";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccountAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <Field label='Type "delete" to confirm' name="confirmText" autoComplete="off" required />
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmDelete"
          value="yes"
          required
          className="mt-0.5 h-5 w-5 shrink-0 accent-workon"
        />
        <span>I understand this permanently deletes everything listed above. It can&apos;t be undone.</span>
      </label>
      {state?.error && <Message kind="error">{state.error}</Message>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-workon px-4 py-3 font-semibold text-pitch disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account permanently"}
      </button>
    </form>
  );
}
