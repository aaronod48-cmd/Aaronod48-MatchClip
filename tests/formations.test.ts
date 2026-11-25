import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formations, fullVideoKeepDays, maxHalfMinutes } from "@/config/formations";

const sql = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

function lastDefinition(fn: string) {
  const matches = [...sql.matchAll(new RegExp(`function private\\.${fn}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi"))];
  return matches.at(-1)?.[1] ?? "";
}

describe("team shapes match the database", () => {
  it("has the same positions for each shape", () => {
    const body = lastDefinition("valid_position");
    for (const [shape, positions] of Object.entries(formations)) {
      const m = body.match(new RegExp(`'${shape}' then p_position = any \\(array\\[([^\\]]+)\\]`));
      const dbCodes = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
      expect(dbCodes.sort()).toEqual(positions.map((p) => p.code).sort());
    }
  });

  it("has 11 positions per shape, each with a spot on the pitch", () => {
    for (const positions of Object.values(formations)) {
      expect(positions).toHaveLength(11);
      for (const p of positions) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps the same video rules as the database", () => {
    expect(lastDefinition("full_video_keep_days")).toContain(`select ${fullVideoKeepDays}`);
    expect(lastDefinition("max_half_seconds")).toContain(`select ${maxHalfMinutes} * 60`);
  });
});
