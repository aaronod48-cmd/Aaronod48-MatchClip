"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getFrameAction, saveTapAction } from "@/app/matches/tap-actions";
import { Message } from "@/components/ui";
import { halfLabels } from "@/lib/matches";

type Half = "first" | "second";
type Props = {
  matchId: string;
  halves: { half: Half; durationSeconds: number }[];
  initial?: { half: Half; seconds: number; x: number; y: number } | null;
};

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function TapYourself({ matchId, halves, initial }: Props) {
  const router = useRouter();
  const startHalf = initial && halves.some((h) => h.half === initial.half) ? initial.half : halves[0].half;
  const [half, setHalf] = useState<Half>(startHalf);
  const duration = halves.find((h) => h.half === half)?.durationSeconds ?? 0;
  const [seconds, setSeconds] = useState(() =>
    initial && initial.half === startHalf ? initial.seconds : Math.min(10, Math.floor(duration / 2)),
  );
  const [frame, setFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(
    initial && initial.half === startHalf ? { x: initial.x, y: initial.y } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  // Fetch a private still frame for the chosen moment (waits until the slider stops).
  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await getFrameAction(matchId, half, seconds);
      if (id !== request.current) return; // a newer request replaced this one
      if ("url" in res) {
        setFrame(res.url);
        setError(null);
      } else {
        setError(res.error);
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [matchId, half, seconds]);

  function onPictureTap(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    setTap({
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    });
  }

  async function save() {
    if (!tap) return;
    setSaving(true);
    const res = await saveTapAction(matchId, half, seconds, tap.x, tap.y);
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.push(`/matches/${matchId}?tapped=1`);
  }

  return (
    <div className="space-y-5">
      <p className="text-muted">
        Slide to a moment where you can clearly see yourself, then{" "}
        <strong className="text-chalk">tap on yourself</strong>.
      </p>

      {halves.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {halves.map((h) => (
            <button
              key={h.half}
              type="button"
              aria-pressed={half === h.half}
              onClick={() => {
                setHalf(h.half);
                setSeconds(Math.min(10, Math.floor(h.durationSeconds / 2)));
                setTap(null);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                half === h.half ? "border-lime text-lime" : "border-line"
              }`}
            >
              {halfLabels[h.half]}
            </button>
          ))}
        </div>
      )}

      <div
        onClick={onPictureTap}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-2xl border border-line bg-pitch-raised"
        role="button"
        aria-label="Tap on yourself in the picture"
      >
        {frame && (
          // Private, short-lived image from the video service: not optimised by Next.js on purpose.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame}
            alt={`Frame at ${clock(seconds)}`}
            className={`h-full w-full object-cover transition-opacity ${loading ? "opacity-50" : ""}`}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Couldn't load this frame. Try another moment.");
            }}
            draggable={false}
          />
        )}
        {!frame && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Loading frame…</p>}
        {tap && (
          <span
            aria-hidden
            className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-lime shadow-[0_0_0_2px_#0d1411]"
            style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
          />
        )}
      </div>

      <label className="block">
        <span className="flex justify-between text-sm">
          <span className="font-medium">Moment</span>
          <span className="text-muted">
            {clock(seconds)} / {clock(duration)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, Math.floor(duration) - 1)}
          step={1}
          value={seconds}
          onChange={(e) => {
            setSeconds(Number(e.target.value));
            setTap(null);
          }}
          className="mt-2 w-full accent-lime"
          aria-label="Moment in the video"
        />
      </label>

      {error && <Message kind="error">{error}</Message>}
      {!tap && !error && <p className="text-sm text-muted">Tap on yourself in the picture.</p>}

      <button
        type="button"
        onClick={save}
        disabled={!tap || saving}
        className="w-full rounded-xl bg-lime px-4 py-3 font-semibold text-pitch disabled:opacity-50"
      >
        {saving ? "Saving…" : "That's me. Save"}
      </button>
    </div>
  );
}
