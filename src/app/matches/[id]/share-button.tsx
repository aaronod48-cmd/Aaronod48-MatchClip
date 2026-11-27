"use client";

import { useActionState, useState } from "react";
import { createShareAction } from "@/app/matches/share-actions";
import { Message, SubmitButton } from "@/components/ui";

/** "Share with my coach": makes a private link that expires, shown once. */
export function ShareButton({ matchId, clipId, label }: { matchId: string; clipId?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createShareAction, undefined);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
      >
        {label}
      </button>
    );
  }

  if (state?.url) {
    const url = state.url;
    return (
      <div className="space-y-3 rounded-xl border border-lime/50 p-3 text-sm">
        <p className="font-semibold text-lime">
          Your private link (works for {state.days} day{state.days === 1 ? "" : "s"})
        </p>
        <input
          readOnly
          value={url}
          aria-label="Private link"
          className="w-full rounded-lg border border-line bg-pitch px-2 py-2 text-xs"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(url).catch(() => {});
              setCopied(true);
            }}
            className="flex-1 rounded-lg bg-lime px-3 py-2 font-semibold text-pitch"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              onClick={() => navigator.share({ title: "Football clips", url }).catch(() => {})}
              className="flex-1 rounded-lg border border-line px-3 py-2 font-semibold"
            >
              Share…
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Send it only to your coach. Anyone with the link can see what you shared until it expires, so don&apos;t post
          it publicly. You can stop it any time under &quot;Shared links&quot;.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-line p-3 text-sm">
      <input type="hidden" name="matchId" value={matchId} />
      {clipId && <input type="hidden" name="clipId" value={clipId} />}
      <label className="block">
        <span className="font-medium">Who is it for? (optional)</span>
        <input
          name="note"
          maxLength={80}
          placeholder="e.g. Coach Sam at Rovers"
          className="mt-1 w-full rounded-lg border border-line bg-pitch px-2 py-2 text-base"
        />
      </label>
      <fieldset>
        <legend className="font-medium">How long should it work?</legend>
        <div className="mt-1 flex gap-3">
          {[1, 7, 14].map((d) => (
            <label key={d} className="flex items-center gap-1.5">
              <input type="radio" name="days" value={d} defaultChecked={d === 7} className="accent-lime" />
              {d} day{d === 1 ? "" : "s"}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <Message kind="error">{state.error}</Message>}
      <div className="flex gap-2">
        <div className="flex-1">
          <SubmitButton pendingText="Creating…">Create private link</SubmitButton>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-line px-3">
          Cancel
        </button>
      </div>
    </form>
  );
}
