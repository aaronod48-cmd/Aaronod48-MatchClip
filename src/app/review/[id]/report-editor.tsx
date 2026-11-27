"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReportAction, type ReportInput } from "@/app/review/report-actions";
import { Message } from "@/components/ui";

type Category = { id: string; name: string; is_active: boolean };
type Drill = { id: string; title: string; description: string | null };
type DrillChoice = ReportInput["workons"][number]["drill"];

export type InitialReport = {
  status: "none" | "draft" | "published";
  scores: { slot: number; categoryId: string | null; score: number | null }[];
  strengths: { id: string; body: string }[];
  workons: { id: string; body: string; drillId: string | null; drillTitle: string | null }[];
};

const textarea = "block w-full rounded-xl border border-line bg-pitch px-3 py-2 text-base focus:outline-none";
const select =
  "w-full rounded-xl border border-line bg-pitch px-3 py-2 text-base text-chalk focus:border-lime focus:outline-none";

export function ReportEditor({
  matchId,
  categories,
  drills,
  initial,
  playerName,
}: {
  matchId: string;
  categories: Category[];
  drills: Drill[];
  initial: InitialReport;
  playerName: string;
}) {
  const router = useRouter();
  const active = categories.filter((c) => c.is_active);
  const [scores, setScores] = useState(() =>
    [1, 2, 3, 4].map((slot) => {
      const s = initial.scores.find((x) => x.slot === slot);
      return { slot, categoryId: s?.categoryId ?? active[slot - 1]?.id ?? "", score: s?.score ?? null };
    }),
  );
  const [strengths, setStrengths] = useState(
    initial.strengths.length ? initial.strengths : [{ id: undefined as string | undefined, body: "" }],
  );
  const [workons, setWorkons] = useState<{ id?: string; body: string; drill: DrillChoice }[]>(
    initial.workons.length
      ? initial.workons.map((w) => ({
          id: w.id,
          body: w.body,
          drill: w.drillId
            ? { kind: "library" as const, drillId: w.drillId }
            : w.drillTitle
              ? { kind: "new" as const, title: w.drillTitle, description: "" }
              : null,
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // What's still missing before this report can be published.
  const missing: string[] = [];
  if (scores.some((s) => !s.categoryId || s.score === null)) missing.push("all four scores");
  if (new Set(scores.map((s) => s.categoryId)).size < 4) missing.push("a different category for each score");
  if (!strengths.some((s) => s.body.trim())) missing.push("at least one strength");
  if (
    workons.some(
      (w) => w.body.trim() && !(w.drill?.kind === "library" || (w.drill?.kind === "new" && w.drill.title.trim())),
    )
  )
    missing.push("a drill for every work-on");

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveReportAction({ matchId, scores, strengths, workons });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSaved(true);
    router.refresh();
  }

  const change = () => setSaved(false);

  return (
    <section className="space-y-6 rounded-2xl border border-line bg-pitch-raised p-4" aria-labelledby="report-heading">
      <div className="flex items-center justify-between">
        <h2 id="report-heading" className="text-lg font-semibold">
          Report
        </h2>
        <span className="text-xs text-muted">
          {initial.status === "published"
            ? "Published · edits show straight away"
            : initial.status === "draft"
              ? "Draft"
              : "Not started"}
        </span>
      </div>

      {/* Scores */}
      <fieldset className="space-y-3">
        <legend className="font-medium">Scores (out of 10)</legend>
        {scores.map((s, i) => (
          <div key={s.slot} className="space-y-2 rounded-xl border border-line p-3">
            <select
              aria-label={`Score ${s.slot} category`}
              value={s.categoryId}
              onChange={(e) => {
                change();
                setScores((all) => all.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)));
              }}
              className={select}
            >
              <option value="">Choose…</option>
              {categories
                .filter((c) => c.is_active || c.id === s.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label={`Score ${s.slot}`}>
              {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={s.score === n}
                  aria-label={`${categories.find((c) => c.id === s.categoryId)?.name ?? `Score ${s.slot}`} ${n}`}
                  onClick={() => {
                    change();
                    setScores((all) => all.map((x, j) => (j === i ? { ...x, score: n } : x)));
                  }}
                  className={`rounded-lg border py-1.5 text-sm font-semibold ${
                    s.score === n ? "border-lime bg-lime text-pitch" : "border-line"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {/* Strengths */}
      <fieldset className="space-y-2">
        <legend className="font-medium text-lime">Strengths</legend>
        {strengths.map((s, i) => (
          <div key={s.id ?? `new-${i}`} className="flex gap-2">
            <textarea
              aria-label={`Strength ${i + 1}`}
              value={s.body}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                change();
                setStrengths((all) => all.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)));
              }}
              className={`${textarea} focus:border-lime`}
            />
            {strengths.length > 1 && (
              <button
                type="button"
                aria-label={`Remove strength ${i + 1}`}
                onClick={() => {
                  change();
                  setStrengths((all) => all.filter((_, j) => j !== i));
                }}
                className="px-2 text-muted"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setStrengths((all) => [...all, { id: undefined, body: "" }])}
          className="text-sm text-lime underline"
        >
          + Add a strength
        </button>
      </fieldset>

      {/* Work-ons, each with a drill */}
      <fieldset className="space-y-3">
        <legend className="font-medium text-workon">Work-ons (each needs a drill)</legend>
        {workons.map((w, i) => (
          <div key={w.id ?? `new-${i}`} className="space-y-2 rounded-xl border border-workon/40 p-3">
            <div className="flex gap-2">
              <textarea
                aria-label={`Work-on ${i + 1}`}
                value={w.body}
                maxLength={500}
                rows={2}
                onChange={(e) => {
                  change();
                  setWorkons((all) => all.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)));
                }}
                className={`${textarea} focus:border-workon`}
              />
              <button
                type="button"
                aria-label={`Remove work-on ${i + 1}`}
                onClick={() => {
                  change();
                  setWorkons((all) => all.filter((_, j) => j !== i));
                }}
                className="px-2 text-muted"
              >
                ✕
              </button>
            </div>
            <select
              aria-label={`Drill for work-on ${i + 1}`}
              value={w.drill?.kind === "library" ? w.drill.drillId : w.drill?.kind === "new" ? "__new" : ""}
              onChange={(e) => {
                change();
                const v = e.target.value;
                const drill: DrillChoice =
                  v === "__new"
                    ? { kind: "new", title: "", description: "" }
                    : v
                      ? { kind: "library", drillId: v }
                      : null;
                setWorkons((all) => all.map((x, j) => (j === i ? { ...x, drill } : x)));
              }}
              className={select}
            >
              <option value="">Choose a drill…</option>
              {drills.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
              <option value="__new">+ New drill…</option>
            </select>
            {w.drill?.kind === "library" && (
              <p className="text-sm text-muted">
                {drills.find((d) => d.id === (w.drill as { drillId: string }).drillId)?.description}
              </p>
            )}
            {w.drill?.kind === "new" && (
              <div className="space-y-2">
                <input
                  aria-label={`New drill title for work-on ${i + 1}`}
                  placeholder="Drill name, e.g. Scan and receive"
                  value={w.drill.title}
                  maxLength={80}
                  onChange={(e) => {
                    change();
                    const title = e.target.value;
                    setWorkons((all) =>
                      all.map((x, j) =>
                        j === i && x.drill?.kind === "new" ? { ...x, drill: { ...x.drill, title } } : x,
                      ),
                    );
                  }}
                  className={select}
                />
                <textarea
                  aria-label={`New drill description for work-on ${i + 1}`}
                  placeholder="How to do it (saved to your drill library)"
                  value={w.drill.description}
                  maxLength={1000}
                  rows={2}
                  onChange={(e) => {
                    change();
                    const description = e.target.value;
                    setWorkons((all) =>
                      all.map((x, j) =>
                        j === i && x.drill?.kind === "new" ? { ...x, drill: { ...x.drill, description } } : x,
                      ),
                    );
                  }}
                  className={`${textarea} focus:border-workon`}
                />
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setWorkons((all) => [...all, { body: "", drill: null }])}
          className="text-sm text-workon underline"
        >
          + Add a work-on
        </button>
      </fieldset>

      {missing.length > 0 ? (
        <p className="text-sm text-muted">Before publishing, add: {missing.join(", ")}.</p>
      ) : (
        <p className="text-sm text-lime">Report ready to publish ✓</p>
      )}
      {error && <Message kind="error">{error}</Message>}
      {saved && !error && <Message kind="success">Report saved.</Message>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="w-full rounded-xl bg-lime px-4 py-3 font-semibold text-pitch disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save report"}
      </button>
      <p className="text-xs text-muted">
        {initial.status === "published"
          ? `Saved changes show to ${playerName} straight away.`
          : `${playerName} sees the report only after you publish.`}
      </p>
    </section>
  );
}
