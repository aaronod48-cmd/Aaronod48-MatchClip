"use client";

import { useActionState, useState } from "react";
import { deleteChildAction, giveConsentAction } from "@/app/children/actions";
import { inviteTeenAction } from "@/app/children/teen-actions";
import { ConsentClient } from "@/app/children/new/consent-client";
import { Field, Message, SubmitButton } from "@/components/ui";

export function GiveConsentForm({ playerId, child }: { playerId: string; child: string }) {
  const [state, action] = useActionState(giveConsentAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl bg-lime px-4 py-3 font-semibold text-pitch"
      >
        Read and give consent
      </button>
    );
  }
  return (
    <form action={action} className="mt-4 space-y-5">
      <input type="hidden" name="playerId" value={playerId} />
      <ConsentClient child={child} />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Saving…">I agree</SubmitButton>
    </form>
  );
}

export function DeleteChildForm({ playerId, child }: { playerId: string; child: string }) {
  const [state, action] = useActionState(deleteChildAction, undefined);
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-line p-4 text-sm">
      <h2 className="font-semibold">Delete {child}</h2>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-workon underline">
          Delete {child} and everything about them…
        </button>
      ) : (
        <form action={action} className="mt-3 space-y-4">
          <input type="hidden" name="playerId" value={playerId} />
          <p className="text-muted">
            This permanently deletes {child}&apos;s profile, consent records and coach links. It can&apos;t be undone.
          </p>
          <label className="flex gap-3">
            <input
              type="checkbox"
              name="confirmDelete"
              value="yes"
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-workon"
            />
            <span>I understand. Delete everything about {child}.</span>
          </label>
          {state?.error && <Message kind="error">{state.error}</Message>}
          <button type="submit" className="w-full rounded-xl bg-workon px-4 py-3 font-semibold text-pitch">
            Delete permanently
          </button>
        </form>
      )}
    </section>
  );
}

export function InviteTeenForm({ playerId, child }: { playerId: string; child: string }) {
  const [state, action] = useActionState(inviteTeenAction, undefined);
  return (
    <form action={action} className="mt-3 space-y-4">
      <p className="text-muted">
        {child} can have their own login to see their clips and reports. They&apos;ll only see their own record, and
        you&apos;ll still see and control everything.
      </p>
      <input type="hidden" name="playerId" value={playerId} />
      <Field label={`${child}'s own email`} name="email" type="email" autoComplete="off" required />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Sending invite…">Invite {child} to their own login</SubmitButton>
    </form>
  );
}
