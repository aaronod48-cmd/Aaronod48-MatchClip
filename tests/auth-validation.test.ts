import { describe, expect, it } from "vitest";
import {
  checkSignUp,
  friendlyAuthError,
  passwordProblem,
  safeNextPath,
} from "@/lib/auth/validation";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const good = {
  accountType: "parent",
  firstName: "Jo",
  email: "Jo@Example.com",
  password: "goodpass123",
  isAdult: "yes",
};

describe("sign-up checks", () => {
  it("accepts a valid parent sign-up and tidies the email", () => {
    const r = checkSignUp(form(good));
    expect(r).toEqual({
      ok: true,
      value: { accountType: "parent", firstName: "Jo", email: "jo@example.com", password: "goodpass123" },
    });
  });

  it("accepts an adult player", () => {
    expect(checkSignUp(form({ ...good, accountType: "player" })).ok).toBe(true);
  });

  it("never allows choosing coach or admin", () => {
    expect(checkSignUp(form({ ...good, accountType: "coach" })).ok).toBe(false);
    expect(checkSignUp(form({ ...good, accountType: "admin" })).ok).toBe(false);
  });

  it("requires the 18-or-over box", () => {
    const r = checkSignUp(form({ ...good, isAdult: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/18 or over/);
  });

  it("rejects a bad email or missing name", () => {
    expect(checkSignUp(form({ ...good, email: "not-an-email" })).ok).toBe(false);
    expect(checkSignUp(form({ ...good, firstName: "   " })).ok).toBe(false);
  });
});

describe("password rules", () => {
  it("needs 10+ characters with letters and numbers", () => {
    expect(passwordProblem("short1")).toMatch(/10 characters/);
    expect(passwordProblem("onlyletterspassword")).toMatch(/letters and numbers/);
    expect(passwordProblem("1234567890")).toMatch(/letters and numbers/);
    expect(passwordProblem("goodpass123")).toBeNull();
  });
});

describe("safe redirects after a link", () => {
  it("allows paths inside the site", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });
  it("blocks links to other websites", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("plain-English errors", () => {
  it("explains common problems", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/don't match/);
    expect(friendlyAuthError("Email not confirmed")).toMatch(/verify your email/);
    expect(friendlyAuthError("email rate limit exceeded")).toMatch(/wait a few minutes/);
    expect(friendlyAuthError("weird internal thing")).toBe("Something went wrong. Please try again.");
  });
});
