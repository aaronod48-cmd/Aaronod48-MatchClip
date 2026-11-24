import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consent, fillConsent } from "@/config/consent";

describe("consent wording", () => {
  it("has the same version as the database", () => {
    const dir = "supabase/migrations";
    const sql = readdirSync(dir).sort().map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
    const matches = [
      ...sql.matchAll(/function private\.current_consent_version\(\)[^$]*\$\$\s*select '([^']+)'/gi),
    ];
    expect(matches.at(-1)?.[1]).toBe(consent.version);
  });

  it("fills in the child's name everywhere and leaves no placeholders", () => {
    const all = [consent.title, consent.intro, consent.confirmLabel, ...consent.sections.flatMap((s) => [s.heading, ...s.points])]
      .map((t) => fillConsent(t, { child: "Sam", brand: "TestBrand", support: "help@example.com" }))
      .join(" ");
    expect(all).toContain("Sam");
    expect(all).not.toMatch(/\{(child|brand|support)\}/);
  });

  it("never types the product name directly (it comes from brand.ts)", () => {
    expect(JSON.stringify(consent)).not.toMatch(/matchclip/i);
  });
});
