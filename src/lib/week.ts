/**
 * Monday of the current week in Sydney, as "YYYY-MM-DD".
 * Must match the database's private.this_week_start() (a test checks).
 */
export function thisWeekStartSydney(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const sydneyDay = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")); // 0 = Monday
  sydneyDay.setUTCDate(sydneyDay.getUTCDate() - weekday);
  return sydneyDay.toISOString().slice(0, 10);
}
