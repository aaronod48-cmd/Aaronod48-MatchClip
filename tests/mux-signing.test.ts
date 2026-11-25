import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { signMuxToken } = await import("@/lib/video/signing");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pemB64 = Buffer.from(privateKey.export({ type: "pkcs1", format: "pem" }).toString()).toString("base64");

describe("Mux signed links", () => {
  const token = signMuxToken("PLAYBACK123", "t", 600, { time: 12.5, width: 960 }, 1_000_000, "KEY1", pemB64);
  const [h, c, s] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());

  it("says which video, what for, which moment and when it expires", () => {
    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "KEY1" });
    expect(claims).toMatchObject({ sub: "PLAYBACK123", aud: "t", exp: 1_000_600, kid: "KEY1", time: 12.5, width: 960 });
  });

  it("is signed with the private key (Mux can check it)", () => {
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("refuses to sign without a key", () => {
    expect(() => signMuxToken("P", "v", 60, {}, 0, "", "")).toThrow();
  });
});
