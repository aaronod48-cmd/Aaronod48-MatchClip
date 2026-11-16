import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";

/** Every source file under src/, except the brand file itself. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|css)$/.test(entry) ? [path] : [];
  });
}

describe("brand config", () => {
  it("has a name, tagline, support email and domain", () => {
    expect(brand.name).toBeTruthy();
    expect(brand.tagline).toBeTruthy();
    expect(brand.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(brand.domain).toBeTruthy();
  });

  it("the product name is not typed anywhere else in the app", () => {
    const brandFile = join("src", "config", "brand.ts");
    const offenders = sourceFiles("src")
      .filter((file) => file !== brandFile)
      .filter((file) =>
        readFileSync(file, "utf8").toLowerCase().includes(brand.name.toLowerCase()),
      );
    expect(offenders).toEqual([]);
  });
});
