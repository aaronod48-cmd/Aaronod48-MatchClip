"use client";

import { ConsentText, consentConfirmLabel } from "@/components/consent-text";

/** The consent wording plus the required "I agree" tick-box. */
export function ConsentClient({ child }: { child: string }) {
  return (
    <>
      <ConsentText child={child} />
      <label className="flex gap-3 rounded-2xl border border-lime/50 p-4 text-sm">
        <input type="checkbox" name="consentConfirmed" value="yes" required className="mt-0.5 h-5 w-5 shrink-0 accent-lime" />
        <span>{consentConfirmLabel(child)}</span>
      </label>
    </>
  );
}
