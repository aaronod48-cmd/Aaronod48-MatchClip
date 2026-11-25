"use client";

import { useActionState } from "react";
import { sendToCoachAction } from "@/app/matches/tap-actions";
import { Message, SubmitButton } from "@/components/ui";

export function SendToCoach({ matchId }: { matchId: string }) {
  const [state, action] = useActionState(sendToCoachAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Sending…">Send to coach</SubmitButton>
      <p className="text-xs text-muted">After sending, you can&apos;t change the videos or your tap.</p>
    </form>
  );
}
