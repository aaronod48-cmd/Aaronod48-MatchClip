import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSupabaseConnection } from "@/lib/supabase/check-connection";

function setEnv(url?: string, key?: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key ?? "");
}

const fakeFetch = (status: number) =>
  vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;

afterEach(() => vi.unstubAllEnvs());

describe("Supabase connection check", () => {
  it("says 'not set up' when the settings are missing", async () => {
    setEnv();
    expect(await checkSupabaseConnection(fakeFetch(200))).toEqual({ state: "not-configured" });
  });

  it("says connected when Supabase answers OK", async () => {
    setEnv("https://abc.supabase.co/", "pk");
    const f = fakeFetch(200);
    expect(await checkSupabaseConnection(f)).toEqual({ state: "connected" });
    const [calledUrl, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(calledUrl)).toBe("https://abc.supabase.co/auth/v1/health");
    expect(init.headers).toEqual({ apikey: "pk" });
  });

  it("explains a wrong key", async () => {
    setEnv("https://abc.supabase.co", "bad");
    const result = await checkSupabaseConnection(fakeFetch(401));
    expect(result.state).toBe("error");
  });

  it("explains when Supabase can't be reached", async () => {
    setEnv("https://abc.supabase.co", "pk");
    const failing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect((await checkSupabaseConnection(failing)).state).toBe("error");
  });

  it("explains a badly typed URL", async () => {
    setEnv("not a url", "pk");
    expect((await checkSupabaseConnection(fakeFetch(200))).state).toBe("error");
  });
});
