"use client";

import { useActionState, useState } from "react";
import { createMatchAction, createMyPlayerProfileAction } from "@/app/matches/actions";
import { Field, Message, SubmitButton, TextLink } from "@/components/ui";
import { formations, teamShapes, type TeamShape } from "@/config/formations";

const selectClass =
  "mt-1 block w-full rounded-xl border border-line bg-pitch-raised px-4 py-3 text-base text-chalk focus:border-lime focus:outline-none";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewMatchForm({
  players,
  preselected,
}: {
  players: { id: string; name: string }[];
  preselected?: string;
}) {
  const [state, action] = useActionState(createMatchAction, undefined);
  // Kept in memory so nothing is lost if the browser clears the form after an error.
  const [playerId, setPlayerId] = useState(preselected ?? (players.length === 1 ? players[0].id : ""));
  const [matchDate, setMatchDate] = useState(todayLocal);
  const [opponent, setOpponent] = useState("");
  const [shape, setShape] = useState<TeamShape>("4-4-2");
  const [position, setPosition] = useState("");
  const [shirt, setShirt] = useState("");
  const [kit, setKit] = useState("");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="matchDate" value={matchDate} />
      <input type="hidden" name="opponent" value={opponent} />
      <input type="hidden" name="teamShape" value={shape} />
      <input type="hidden" name="position" value={position} />
      <input type="hidden" name="shirtNumber" value={shirt} />
      <input type="hidden" name="kitColour" value={kit} />

      {players.length > 1 && (
        <label className="block">
          <span className="text-sm font-medium">Who played?</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={selectClass}>
            <option value="">Choose…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <Field
        label="Match date"
        type="date"
        value={matchDate}
        onChange={(e) => setMatchDate(e.target.value)}
        max={todayLocal()}
      />
      <Field
        label="Opponent (optional)"
        value={opponent}
        onChange={(e) => setOpponent(e.target.value)}
        maxLength={80}
      />

      <fieldset>
        <legend className="text-sm font-medium">Your team&apos;s shape</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {teamShapes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setShape(s);
                setPosition("");
              }}
              aria-pressed={shape === s}
              className={`rounded-xl border px-4 py-3 font-semibold ${shape === s ? "border-lime bg-pitch-raised text-lime" : "border-line"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium">Position</span>
        <select value={position} onChange={(e) => setPosition(e.target.value)} className={selectClass}>
          <option value="">Choose…</option>
          {formations[shape].map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="Shirt number"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={shirt}
        onChange={(e) => setShirt(e.target.value)}
      />
      <Field
        label="Kit colour"
        value={kit}
        onChange={(e) => setKit(e.target.value)}
        maxLength={40}
        hint="Describe it so the coach can spot you, e.g. red shirt, white shorts, black socks."
      />

      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Saving…">Next: upload the video</SubmitButton>
      <p className="text-center text-sm">
        <TextLink href="/dashboard">Cancel</TextLink>
      </p>
    </form>
  );
}

export function AdultProfileForm() {
  const [state, action] = useActionState(createMyPlayerProfileAction, undefined);
  const thisYear = new Date().getFullYear();
  return (
    <form action={action} className="space-y-5">
      <p className="text-muted">First, a little about you. You only do this once.</p>
      <label className="block">
        <span className="text-sm font-medium">Year you were born</span>
        <select name="birthYear" required className={selectClass} defaultValue="">
          <option value="">Choose a year</option>
          {Array.from({ length: 60 }, (_, i) => thisYear - 19 - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <Field label="Team (optional)" name="teamName" maxLength={80} />
      {state?.error && <Message kind="error">{state.error}</Message>}
      <SubmitButton pendingText="Saving…">Continue</SubmitButton>
    </form>
  );
}
