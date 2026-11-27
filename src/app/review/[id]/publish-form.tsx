"use client";

import { useActionState } from "react";
import { publishAction } from "@/app/review/actions";
import { Message, SubmitButton } from "@/components/ui";

export function PublishForm({
  matchId,
  clipCount,
  playerName,
  republish = false,
  reportPending = false,
}: {
  matchId: string;
  clipCount: number;
  playerName: string;
  republish?: boolean;
  reportPending?: boolean;
}) {
  const label = !republish
    ? "Publish clips and report"
    : reportPending
      ? clipCount
        ? "Publish report and new clips"
        : "Publish report"
      : "Publish new clips";
  const what = republish
    ? [clipCount ? `${clipCount} new clip${clipCount > 1 ? "s" : ""}` : "", reportPending ? "the report" : ""]
        .filter(Boolean)
        .join(" and ")
    : "";
  const [state, action] = useActionState(publishAction, undefined);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-lime/50 p-4">
      <h2 className="font-semibold">{label}</h2>
      <p className="text-sm text-muted">
        {republish
          ? `${what || "Nothing new"} not published yet. ${playerName} can't see it until you publish.`
          : clipCount
            ? `${clipCount} clip${clipCount > 1 ? "s" : ""} and the report. Until you publish, ${playerName} and their parent can't see anything.`
            : "Save at least one clip with a strength note, and the report, first."}
      </p>
      <input type="hidden" name="matchId" value={matchId} />
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmPublish"
          value="yes"
          required
          className="mt-0.5 h-5 w-5 shrink-0 accent-lime"
        />
        <span>I&apos;ve checked every clip, tag, note and the report. Show them to {playerName}.</span>
      </label>
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Publishing…">
        {label}
      </SubmitButton>
    </form>
  );
}
