"use client";

import MuxPlayer from "@mux/mux-player-react";
import { useState } from "react";
import type { ClipPlayback } from "@/lib/video/playback";

type Ring = { seconds: number; x: number; y: number } | null; // seconds into the clip

/** How long (seconds) the coach's ring stays on screen around its moment. */
const RING_WINDOW = 1.5;

/**
 * Plays one clip and shows the coach's ring on the player at the moment the
 * coach placed it.
 */
export function ClipPlayer({
  playback,
  ring,
  length,
  label,
}: {
  playback: ClipPlayback;
  ring: Ring;
  length: number;
  label: string;
}) {
  const [t, setT] = useState(0);
  const showRing = ring !== null && Math.abs(t - ring.seconds) <= RING_WINDOW;

  if (playback.kind === "preparing") {
    return (
      <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
        This clip is being prepared. Refresh in a minute.
      </div>
    );
  }
  if (playback.kind === "error") {
    return (
      <div className="grid aspect-video place-items-center rounded-xl text-sm text-workon">{playback.message}</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        {playback.kind === "mux" ? (
          <MuxPlayer
            playbackId={playback.playbackId}
            tokens={playback.tokens}
            streamType="on-demand"
            accentColor="#c8f04a"
            metadata={{ video_title: label }}
            onTimeUpdate={(e) => setT((e.target as HTMLVideoElement).currentTime)}
            style={{ aspectRatio: "16 / 9", width: "100%" }}
          />
        ) : (
          <div className="grid aspect-video place-items-center bg-[#2f6b3a] text-white" data-testid="fake-clip-player">
            Test clip · {t.toFixed(1)} s
          </div>
        )}
        {showRing && (
          <span
            aria-label="Coach's ring"
            role="img"
            className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-4 border-lime shadow-[0_0_0_2px_#0d1411]"
            style={{ left: `${ring.x * 100}%`, top: `${ring.y * 100}%` }}
          />
        )}
      </div>
      {playback.kind === "fake" && (
        <input
          type="range"
          min={0}
          max={length}
          step={0.1}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label={`${label} time`}
          className="w-full accent-lime"
        />
      )}
    </div>
  );
}
