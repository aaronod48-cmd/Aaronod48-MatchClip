/** Plain-English labels for a match's progress. */
export const matchStatusLabels: Record<string, { label: string; tone: "muted" | "lime" | "workon" }> = {
  uploading: { label: "Not sent yet", tone: "workon" },
  waiting_for_coach: { label: "Waiting for coach", tone: "muted" },
  in_review: { label: "Coach is reviewing", tone: "muted" },
  published: { label: "Clips ready", tone: "lime" },
};

export const halfLabels = { first: "First half", second: "Second half" } as const;

const dateFmt = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** "Sat 22 Nov" from "2026-11-22" (a date with no time, so shown as-is). */
export function formatMatchDate(isoDate: string) {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}
