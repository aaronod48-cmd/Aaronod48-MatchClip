"use client";

import { useActionState, useState } from "react";
import { deleteMatchAction } from "@/app/matches/actions";
import { Message } from "@/components/ui";

export function DeleteMatchForm({ matchId }: { matchId: string }) {
  const [state, action] = useActionState(deleteMatchAction, undefined);
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-line p-4 text-sm">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-workon underline">
          Delete this match…
        </button>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="matchId" value={matchId} />
          <p className="text-muted">
            This permanently deletes the match, its videos and any clips. It can&apos;t be undone.
          </p>
          <label className="flex gap-3">
            <input
              type="checkbox"
              name="confirmDelete"
              value="yes"
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-workon"
            />
            <span>I understand. Delete this match.</span>
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
