"use client";

import MuxPlayer from "@mux/mux-player-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteClipAction, getPlaybackAction, saveClipAction } from "@/app/review/actions";
import { Message } from "@/components/ui";
import { halfLabels } from "@/lib/matches";
import type { Playback } from "@/lib/video/playback";

type Half = "first" | "second";
export type SavedClip = {
  id: string;
  videoId: string | null;
  start: number;
  end: number;
  ring: { seconds: number; x: number; y: number } | null; // seconds = time in the half
  strengthNote: string;
  workonNote: string;
  status: string;
  tagIds: string[];
};
type Props = {
  matchId: string;
  halves: { half: Half; videoId: string; duration: number }[];
  initialHalf: Half;
  initialPlayback: Playback;
  tags: { id: string; name: string; is_active: boolean }[];
  clips: SavedClip[];
  matchPublished: boolean;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const empty = {
  start: null as number | null,
  end: null as number | null,
  ring: null as SavedClip["ring"],
  strength: "",
  workon: "",
  tagIds: [] as string[],
};

export function ReviewWorkspace({ matchId, halves, initialHalf, initialPlayback, tags, clips, matchPublished }: Props) {
  const router = useRouter();
  const [half, setHalf] = useState<Half>(initialHalf);
  const [playback, setPlayback] = useState<Playback>(initialPlayback);
  const [fakeTime, setFakeTime] = useState(0);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(empty);
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const current = halves.find((h) => h.half === half)!;
  const duration = playback.kind === "error" ? current.duration : playback.duration;

  const now = () => (playback.kind === "fake" ? fakeTime : (playerRef.current?.currentTime ?? 0));
  const seek = (t: number) => {
    if (playback.kind === "fake") setFakeTime(t);
    else if (playerRef.current) playerRef.current.currentTime = t;
  };
  const pause = () => playerRef.current?.pause();

  async function switchHalf(h: Half) {
    if (h === half) return;
    setHalf(h);
    setDraft(empty);
    setEditingId(null);
    setFakeTime(0);
    setPlayback(await getPlaybackAction(matchId, h));
  }

  function markStart() {
    setNotice(null);
    const t = Math.round(now() * 10) / 10;
    setDraft((d) => ({ ...d, start: t, end: d.end !== null && d.end > t ? d.end : null }));
  }
  function markEnd() {
    const t = Math.round(now() * 10) / 10;
    setDraft((d) => ({ ...d, end: t }));
  }
  function placeRingAt(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    setDraft((d) => ({
      ...d,
      ring: {
        seconds: Math.round(now() * 10) / 10,
        x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
      },
    }));
    setPlacing(false);
  }

  const length = draft.start !== null && draft.end !== null ? draft.end - draft.start : null;
  const lengthOk = length !== null && length >= 2 && length <= 60;
  const ringOk =
    !draft.ring ||
    (draft.start !== null &&
      draft.end !== null &&
      draft.ring.seconds >= draft.start &&
      draft.ring.seconds <= draft.end);

  async function save() {
    if (draft.start === null || draft.end === null) return setError("Mark the start and end of the clip.");
    if (!lengthOk) return setError("A clip must be between 2 and 60 seconds.");
    if (!ringOk) return setError("Place the ring at a moment inside the clip.");
    if (!draft.strength.trim()) return setError("Please write a strength note.");
    setBusy(true);
    setError(null);
    const res = await saveClipAction({
      matchId,
      clipId: editingId ?? undefined,
      videoId: current.videoId,
      start: draft.start,
      end: draft.end,
      ring: draft.ring,
      strengthNote: draft.strength,
      workonNote: draft.workon,
      tagIds: draft.tagIds,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setNotice(editingId ? "Clip updated." : "Clip saved.");
    setDraft(empty);
    setEditingId(null);
    router.refresh();
  }

  function edit(c: SavedClip) {
    const h = halves.find((x) => x.videoId === c.videoId)?.half;
    if (h && h !== half) switchHalf(h);
    setEditingId(c.id);
    setDraft({
      start: c.start,
      end: c.end,
      ring: c.ring,
      strength: c.strengthNote,
      workon: c.workonNote,
      tagIds: c.tagIds,
    });
    setNotice(null);
    setTimeout(() => seek(c.start), 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(c: SavedClip) {
    if (!window.confirm("Delete this clip?")) return;
    const res = await deleteClipAction(c.id);
    if (res.error) return setError(res.error);
    if (editingId === c.id) {
      setEditingId(null);
      setDraft(empty);
    }
    router.refresh();
  }

  const clipsThisHalf = clips.filter((c) => c.videoId === current.videoId);
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "";
  const timesLocked = editingId !== null && clips.find((c) => c.id === editingId)?.status === "published";

  return (
    <div className="space-y-6">
      {halves.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {halves.map((h) => (
            <button
              key={h.half}
              type="button"
              aria-pressed={half === h.half}
              onClick={() => switchHalf(h.half)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${half === h.half ? "border-lime text-lime" : "border-line"}`}
            >
              {halfLabels[h.half]}
            </button>
          ))}
        </div>
      )}

      {/* The video, with a tap layer for placing the ring */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
        {playback.kind === "mux" && (
          <MuxPlayer
            ref={playerRef as never}
            playbackId={playback.playbackId}
            tokens={playback.tokens}
            streamType="on-demand"
            accentColor="#c8f04a"
            style={{ aspectRatio: "16 / 9", width: "100%" }}
          />
        )}
        {playback.kind === "fake" && (
          <div className="grid aspect-video place-items-center bg-[#2f6b3a] text-white" data-testid="fake-player">
            Test video · {clock(fakeTime)}
          </div>
        )}
        {playback.kind === "error" && (
          <div className="grid aspect-video place-items-center p-6 text-center text-workon">{playback.message}</div>
        )}
        {placing && (
          <div
            onClick={placeRingAt}
            role="button"
            aria-label="Tap the player to place the ring"
            className="absolute inset-0 cursor-crosshair bg-lime/10 ring-4 ring-inset ring-lime"
          />
        )}
        {!placing && draft.ring && (
          <span
            aria-hidden
            className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-lime shadow-[0_0_0_2px_#0d1411]"
            style={{ left: `${draft.ring.x * 100}%`, top: `${draft.ring.y * 100}%` }}
          />
        )}
      </div>

      {playback.kind === "fake" && (
        <input
          type="range"
          min={0}
          max={Math.floor(duration)}
          step={0.1}
          value={fakeTime}
          onChange={(e) => setFakeTime(Number(e.target.value))}
          aria-label="Video time"
          className="w-full accent-lime"
        />
      )}

      {
        <section className="space-y-4 rounded-2xl border border-line bg-pitch-raised p-4">
          <h2 className="font-semibold">{editingId ? "Edit clip" : "New clip"}</h2>
          {matchPublished && !editingId && (
            <p className="text-sm text-muted">
              New clips stay hidden until you press &quot;Publish new clips&quot; below.
            </p>
          )}
          {timesLocked && (
            <p className="text-sm text-muted">
              This clip is published, so its times are fixed. You can change the ring, tags and notes, and the player
              sees the update straight away.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={markStart}
              disabled={timesLocked}
              className="rounded-xl border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Mark start {draft.start !== null && <span className="text-lime">· {clock(draft.start)}</span>}
            </button>
            <button
              type="button"
              onClick={markEnd}
              disabled={timesLocked}
              className="rounded-xl border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Mark end {draft.end !== null && <span className="text-lime">· {clock(draft.end)}</span>}
            </button>
          </div>
          {length !== null && (
            <p className={`text-sm ${lengthOk ? "text-muted" : "text-workon"}`}>
              Clip length {length.toFixed(1)} s {lengthOk ? "" : "(must be 2 to 60 seconds)"}
            </p>
          )}
          {draft.start !== null && (
            <button type="button" onClick={() => seek(draft.start!)} className="text-sm text-muted underline">
              Go to clip start
            </button>
          )}

          <div>
            <button
              type="button"
              onClick={() => {
                pause();
                setPlacing((p) => !p);
              }}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold ${placing ? "border-lime text-lime" : "border-line"}`}
            >
              {placing
                ? "Tap the player on the video…"
                : draft.ring
                  ? `Move ring (at ${clock(draft.ring.seconds)})`
                  : "Place ring"}
            </button>
            {!ringOk && <p className="mt-1 text-sm text-workon">The ring must be at a moment inside the clip.</p>}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Tags</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags
                .filter((t) => t.is_active || draft.tagIds.includes(t.id))
                .map((t) => {
                  const on = draft.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          tagIds: on ? d.tagIds.filter((x) => x !== t.id) : [...d.tagIds, t.id],
                        }))
                      }
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-lime bg-lime text-pitch" : "border-line"}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-lime">Strength note</span>
            <textarea
              value={draft.strength}
              onChange={(e) => setDraft((d) => ({ ...d, strength: e.target.value }))}
              maxLength={500}
              rows={2}
              className="mt-1 block w-full rounded-xl border border-line bg-pitch px-3 py-2 text-base focus:border-lime focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-workon">Work-on note (optional)</span>
            <textarea
              value={draft.workon}
              onChange={(e) => setDraft((d) => ({ ...d, workon: e.target.value }))}
              maxLength={500}
              rows={2}
              className="mt-1 block w-full rounded-xl border border-line bg-pitch px-3 py-2 text-base focus:border-workon focus:outline-none"
            />
          </label>

          {error && <Message kind="error">{error}</Message>}
          {notice && !error && <Message kind="success">{notice}</Message>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-xl bg-lime px-4 py-3 font-semibold text-pitch disabled:opacity-60"
            >
              {busy ? "Saving…" : editingId ? "Update clip" : "Save clip"}
            </button>
            {(editingId || draft.start !== null) && (
              <button
                type="button"
                onClick={() => {
                  setDraft(empty);
                  setEditingId(null);
                  setError(null);
                }}
                className="rounded-xl border border-line px-4 py-3 text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </section>
      }

      <section>
        <h2 className="font-semibold">
          Clips · {halfLabels[half]} ({clipsThisHalf.length})
        </h2>
        {clipsThisHalf.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No clips yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {clipsThisHalf.map((c) => (
              <li key={c.id} className="rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => seek(c.start)}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {clock(c.start)} – {clock(c.end)}
                  </button>
                  <span className="text-xs text-muted">{c.status === "published" ? "Published" : "Draft"}</span>
                </div>
                {c.tagIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.tagIds.map((t) => (
                      <span key={t} className="rounded-full border border-line px-2 py-0.5 text-xs">
                        {tagName(t)}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-lime">{c.strengthNote}</p>
                {c.workonNote && <p className="mt-1 text-workon">{c.workonNote}</p>}
                {!c.ring && <p className="mt-1 text-xs text-muted">No ring placed.</p>}
                {
                  <div className="mt-3 flex gap-4">
                    <button type="button" onClick={() => edit(c)} className="text-muted underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(c)} className="text-workon underline">
                      Delete
                    </button>
                  </div>
                }
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
