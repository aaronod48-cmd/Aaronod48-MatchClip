import { describe, expect, it } from "vitest";
import { ageGroupFromBirthYear, ageRules } from "@/config/age-rules";

const today = new Date("2026-11-16");
const year = today.getFullYear();

describe("age rules", () => {
  it("uses 13 for own login and 18 for adult (change in src/config/age-rules.ts)", () => {
    expect(ageRules.ownLoginMinAge).toBe(13);
    expect(ageRules.adultAge).toBe(18);
  });

  it("treats a young child as a child (parent account only)", () => {
    expect(ageGroupFromBirthYear(year - 10, today)).toBe("child");
  });

  it("never treats someone as older than they might be", () => {
    // Born 13 years ago could still be 12 if their birthday hasn't come yet.
    expect(ageGroupFromBirthYear(year - 13, today)).toBe("child");
    expect(ageGroupFromBirthYear(year - 14, today)).toBe("teen");
    // Born 18 years ago could still be 17.
    expect(ageGroupFromBirthYear(year - 18, today)).toBe("teen");
    expect(ageGroupFromBirthYear(year - 19, today)).toBe("adult");
  });
});
