"use client";

import { UpChunk } from "@mux/upchunk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { halfUploadedAction, startHalfUploadAction } from "@/app/matches/actions";
import { Message } from "@/components/ui";
import { maxHalfMinutes } from "@/config/formations";
import { halfLabels } from "@/lib/matches";

type Stage = "pick" | "checking" | "uploading" | "offline" | "finishing" | "error";

/** Reads how long a video is, on the phone, before uploading. */
function videoMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration / 60 : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null); // some phones can't tell; the server checks again after upload
    };
    v.src = url;
  });
}

export function HalfUploader({
  matchId,
  half,
  failed,
}: {
  matchId: string;
  half: "first" | "second";
  failed: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(
    failed ? `The last upload didn't work, or was longer than ${maxHalfMinutes} minutes. Please try again.` : null,
  );
  const uploadRef = useRef<UpChunk | null>(null);

  // Warn before leaving the page mid-upload.
  useEffect(() => {
    if (stage !== "uploading" && stage !== "offline") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  async function start(file: File) {
    setError(null);
    if (!file.type.startsWith("video/")) return setError("Please choose a video file.");
    setStage("checking");
    const minutes = await videoMinutes(file);
    if (minutes !== null && minutes > maxHalfMinutes) {
      setStage("pick");
      return setError(
        `This video is ${Math.round(minutes)} minutes long. Each half can be up to ${maxHalfMinutes} minutes.`,
      );
    }

    const { url, videoId, error } = await startHalfUploadAction(matchId, half);
    if (!url || !videoId) {
      setStage("pick");
      return setError(error ?? "Couldn't start the upload.");
    }

    setStage("uploading");
    setProgress(0);
    const upload = UpChunk.createUpload({ endpoint: url, file, chunkSize: 30720, attempts: 10 }); // 30 MB pieces
    uploadRef.current = upload;
    upload.on("progress", (e) => setProgress(Math.floor(e.detail as number)));
    upload.on("offline", () => setStage("offline"));
    upload.on("online", () => setStage("uploading"));
    upload.on("error", () => {
      setStage("error");
      setError("The upload stopped. Check your connection and try again.");
    });
    upload.on("success", async () => {
      setStage("finishing");
      await halfUploadedAction(videoId);
      router.refresh();
    });
  }

  if (stage === "uploading" || stage === "offline" || stage === "finishing") {
    return (
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress}>
          <div className="h-full bg-lime transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-muted">
          {stage === "finishing"
            ? "Upload complete. Finishing off…"
            : stage === "offline"
              ? `No connection. Paused at ${progress}%. It will carry on by itself when you're back online.`
              : `Uploading ${halfLabels[half].toLowerCase()}: ${progress}%. Keep this page open.`}
        </p>
        {stage !== "finishing" && (
          <button
            type="button"
            className="text-sm text-muted underline"
            onClick={() => {
              uploadRef.current?.abort();
              setStage("pick");
            }}
          >
            Cancel upload
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Message kind="error">{error}</Message>}
      <label
        className={`block w-full cursor-pointer rounded-xl bg-lime px-4 py-3 text-center font-semibold text-pitch ${
          stage === "checking" ? "opacity-60" : ""
        }`}
      >
        {stage === "checking" ? "Checking video…" : `Choose ${halfLabels[half].toLowerCase()} video`}
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          disabled={stage === "checking"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) start(f);
          }}
        />
      </label>
      <p className="text-xs text-muted">
        Up to {maxHalfMinutes} minutes. Use test videos only while we&apos;re building.
      </p>
    </div>
  );
}
