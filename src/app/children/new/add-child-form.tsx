"use client";

import { useActionState, useState } from "react";
import { addChildAction } from "@/app/children/actions";
import { Field, Message, SubmitButton, TextLink } from "@/components/ui";
import { ConsentClient } from "./consent-client";
import { ageRules } from "@/config/age-rules";
import { consent } from "@/config/consent";

const thisYear = new Date().getFullYear();
// Youngest possible age under 18 (we only know the birth year), and at least 3.
const birthYears = Array.from({ length: ageRules.adultAge - 2 }, (_, i) => thisYear - 3 - i);

export function AddChildForm() {
  const [state, action] = useActionState(addChildAction, undefined);
  const [step, setStep] = useState<"details" | "consent">("details");
  const [firstName, setFirstName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [teamName, setTeamName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function next() {
    if (!firstName.trim()) return setLocalError("Please enter your child's first name.");
    if (!birthYear) return setLocalError("Please choose the year your child was born.");
    setLocalError(null);
    setStep("consent");
    window.scrollTo({ top: 0 });
  }

  return (
    <form action={action} className="space-y-5">
      {/*
        The details are kept in memory and sent via the hidden boxes below.
        (After a failed attempt the browser clears the form, so the visible
        boxes on step 1 aren't relied on.)
      */}
      <input type="hidden" name="firstName" value={firstName} />
      <input type="hidden" name="birthYear" value={birthYear} />
      <input type="hidden" name="teamName" value={teamName} />

      {/* Step 1: details */}
      <div className={step === "details" ? "space-y-5" : "hidden"}>
        <p className="text-sm text-muted">Step 1 of 2. We only ask for what we need.</p>
        <Field
          label="Child's first name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          maxLength={40}
          autoComplete="off"
        />
        <label className="block">
          <span className="text-sm font-medium">Year they were born</span>
          <select
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-line bg-pitch-raised px-4 py-3 text-base text-chalk focus:border-lime focus:outline-none"
          >
            <option value="">Choose a year</option>
            {birthYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Just the year, not their birthday.</span>
        </label>
        <Field
          label="Team (optional)"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={80}
          hint="For example: Under 12 Lions"
          autoComplete="off"
        />
        {localError && <Message kind="error">{localError}</Message>}
        <button type="button" onClick={next} className="w-full rounded-xl bg-lime px-4 py-3 font-semibold text-pitch">
          Next: consent
        </button>
        <p className="text-center text-sm">
          <TextLink href="/dashboard">Cancel</TextLink>
        </p>
      </div>

      {/* Step 2: consent */}
      {step === "consent" && (
        <div className="space-y-5">
          <p className="text-sm text-muted">Step 2 of 2.</p>
          <ConsentClient child={firstName.trim()} />
          <input type="hidden" name="consentVersion" value={consent.version} />
          {state?.error && <Message kind="error">{state.error}</Message>}
          <SubmitButton pendingText="Saving…">I agree. Add {firstName.trim()}</SubmitButton>
          <button type="button" onClick={() => setStep("details")} className="w-full text-sm text-muted underline">
            Back
          </button>
        </div>
      )}
    </form>
  );
}
