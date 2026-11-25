import "server-only";

/**
 * The video service (Mux), behind a small set of functions so the rest of
 * the app never talks to Mux directly.
 *
 * VIDEO_PROVIDER=fake swaps in a pretend service for automatic tests on a
 * developer's machine. It refuses to run on Vercel, so the real site always
 * uses Mux.
 *
 * Settings (Vercel -> Environment Variables, both marked Sensitive):
 *   MUX_TOKEN_ID, MUX_TOKEN_SECRET
 */

export type UploadStatus = { state: "waiting" } | { state: "asset_created"; assetId: string } | { state: "failed" };

export type AssetStatus =
  | { state: "processing" }
  | { state: "ready"; playbackId: string; durationSeconds: number }
  | { state: "failed" };

export interface VideoProvider {
  name: "mux" | "fake";
  /** A one-time address the phone uploads the file to (straight to the video service). */
  createUpload(opts: { corsOrigin: string; passthrough: string }): Promise<{ uploadId: string; url: string }>;
  getUpload(uploadId: string): Promise<UploadStatus>;
  getAsset(assetId: string): Promise<AssetStatus>;
  deleteAsset(assetId: string): Promise<void>;
  cancelUpload(uploadId: string): Promise<void>;
  /** Cut a clip from an existing video as its own (private) video. Returns the new asset's id. */
  createClipAsset(opts: { sourceAssetId: string; start: number; end: number; passthrough: string }): Promise<string>;
}

class MuxProvider implements VideoProvider {
  name = "mux" as const;
  constructor(
    private tokenId: string,
    private tokenSecret: string,
  ) {}

  private async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`https://api.mux.com${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.tokenId}:${this.tokenSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status === 404 && method === "DELETE") return null; // already gone
    if (!res.ok) throw new Error(`Mux ${method} ${path} failed: ${res.status}`);
    return res.status === 204 ? null : ((await res.json()) as { data: Record<string, unknown> }).data;
  }

  async createUpload({ corsOrigin, passthrough }: { corsOrigin: string; passthrough: string }) {
    const data = await this.call("POST", "/video/v1/uploads", {
      cors_origin: corsOrigin,
      timeout: 6 * 60 * 60, // the upload address works for 6 hours
      new_asset_settings: {
        playback_policies: ["signed"], // private: only playable with a short-lived signed link
        video_quality: "basic",
        max_resolution_tier: "1080p",
        passthrough,
      },
    });
    return { uploadId: String(data!.id), url: String(data!.url) };
  }

  async getUpload(uploadId: string): Promise<UploadStatus> {
    const data = await this.call("GET", `/video/v1/uploads/${encodeURIComponent(uploadId)}`);
    if (data?.status === "asset_created" && data.asset_id)
      return { state: "asset_created", assetId: String(data.asset_id) };
    if (data?.status === "waiting") return { state: "waiting" };
    return { state: "failed" };
  }

  async getAsset(assetId: string): Promise<AssetStatus> {
    const data = await this.call("GET", `/video/v1/assets/${encodeURIComponent(assetId)}`);
    if (data?.status === "ready") {
      const ids = (data.playback_ids as { id: string; policy: string }[] | undefined) ?? [];
      const signed = ids.find((p) => p.policy === "signed");
      if (!signed) return { state: "failed" }; // never fall back to a public link
      return { state: "ready", playbackId: signed.id, durationSeconds: Number(data.duration ?? 0) };
    }
    if (data?.status === "preparing") return { state: "processing" };
    return { state: "failed" };
  }

  async deleteAsset(assetId: string) {
    await this.call("DELETE", `/video/v1/assets/${encodeURIComponent(assetId)}`);
  }

  async createClipAsset({
    sourceAssetId,
    start,
    end,
    passthrough,
  }: {
    sourceAssetId: string;
    start: number;
    end: number;
    passthrough: string;
  }) {
    const data = await this.call("POST", "/video/v1/assets", {
      inputs: [{ url: `mux://assets/${sourceAssetId}`, start_time: start, end_time: end }],
      playback_policies: ["signed"],
      video_quality: "basic",
      passthrough,
    });
    return String(data!.id);
  }

  async cancelUpload(uploadId: string) {
    try {
      await this.call("PUT", `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
    } catch {
      // Already finished or cancelled: nothing to do.
    }
  }
}

/** Pretend video service for automatic tests. Never used on Vercel. */
class FakeProvider implements VideoProvider {
  name = "fake" as const;
  async createUpload({ corsOrigin, passthrough }: { corsOrigin: string; passthrough: string }) {
    const uploadId = `fake-upload-${passthrough}`;
    return { uploadId, url: `${corsOrigin}/api/fake-video-upload/${encodeURIComponent(uploadId)}` };
  }
  async getUpload(uploadId: string): Promise<UploadStatus> {
    return { state: "asset_created", assetId: uploadId.replace("fake-upload-", "fake-asset-") };
  }
  async getAsset(assetId: string): Promise<AssetStatus> {
    return { state: "ready", playbackId: assetId.replace("fake-asset-", "fake-playback-"), durationSeconds: 125 };
  }
  async deleteAsset() {}
  async cancelUpload() {}
  async createClipAsset({ passthrough }: { passthrough: string }) {
    return `fake-asset-clip-${passthrough}`;
  }
}

export function isFakeVideoAllowed() {
  return process.env.VIDEO_PROVIDER === "fake" && !process.env.VERCEL;
}

export function getVideoProvider(): VideoProvider | null {
  if (isFakeVideoAllowed()) return new FakeProvider();
  const id = process.env.MUX_TOKEN_ID?.trim();
  const secret = process.env.MUX_TOKEN_SECRET?.trim();
  return id && secret ? new MuxProvider(id, secret) : null;
}
