import "server-only";
import { createSign } from "node:crypto";

/**
 * Short-lived private links for Mux videos and still frames.
 *
 * Videos are uploaded with a "signed" playback policy, so Mux only shows them
 * with a token signed by our private signing key. The token says which video,
 * what for (v = play, t = still frame, s = timeline previews), any options
 * (e.g. the moment for a still frame) and when it stops working.
 *
 * Settings (Vercel, Sensitive): MUX_SIGNING_KEY_ID, MUX_SIGNING_PRIVATE_KEY
 * (the private key exactly as Mux gives it: base64).
 */

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export type Audience = "v" | "t" | "s";

export function signingKeyMissing(): boolean {
  return !process.env.MUX_SIGNING_KEY_ID?.trim() || !process.env.MUX_SIGNING_PRIVATE_KEY?.trim();
}

export function signMuxToken(
  playbackId: string,
  aud: Audience,
  ttlSeconds: number,
  params: Record<string, string | number> = {},
  now: number = Math.floor(Date.now() / 1000),
  keyId: string = process.env.MUX_SIGNING_KEY_ID?.trim() ?? "",
  privateKeyBase64: string = process.env.MUX_SIGNING_PRIVATE_KEY?.trim() ?? "",
): string {
  if (!keyId || !privateKeyBase64) throw new Error("Mux signing key missing");
  const header = { alg: "RS256", typ: "JWT", kid: keyId };
  const claims = { ...params, sub: playbackId, aud, exp: now + ttlSeconds, kid: keyId };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const pem = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(pem);
  return `${unsigned}.${b64url(signature)}`;
}

/** A still frame at a given moment (seconds into the half), valid for a few minutes. */
export function signedThumbnailUrl(playbackId: string, seconds: number, width = 960): string {
  const token = signMuxToken(playbackId, "t", 10 * 60, { time: Math.max(0, Math.round(seconds * 10) / 10), width });
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?token=${token}`;
}
