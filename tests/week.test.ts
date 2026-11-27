import { describe, expect, it } from "vitest";
import { thisWeekStartSydney } from "@/lib/week";

describe("this week's Monday (Sydney time)", () => {
  it("is the same Monday all week", () => {
    expect(thisWeekStartSydney(new Date("2026-11-23T01:00:00+11:00"))).toBe("2026-11-23"); // Monday 1am
    expect(thisWeekStartSydney(new Date("2026-11-27T12:00:00+11:00"))).toBe("2026-11-23"); // Friday
    expect(thisWeekStartSydney(new Date("2026-11-29T23:30:00+11:00"))).toBe("2026-11-23"); // Sunday night
  });
  it("uses Sydney time, not UTC", () => {
    // Monday 8am in Sydney is still Sunday in UTC, but it's the new week in Sydney.
    expect(thisWeekStartSydney(new Date("2026-11-30T08:00:00+11:00"))).toBe("2026-11-30");
  });
});
